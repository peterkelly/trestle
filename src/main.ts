// Copyright 2018 Peter Kelly <peter@pmkelly.net>
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as fs from "fs";
import * as blessed from "blessed";
import { Parser } from "./parse";
import { SExpr, SymbolExpr, PairExpr, NilExpr, BuildError, buildSequenceFromList } from "./sexpr";
import { SourceInput, testSourceCoords } from "./source";
import { LexicalScope } from "./scope";
import { Variable, Environment, SchemeException } from "./runtime";
import { Value, NumberValue, ErrorValue } from "./value";
import { BuiltinProcedureValue, builtins, wrapBuiltinCPS } from "./builtins";
import { simplify } from "./simplify";
import { evalDirect, disableEvalDirect } from "./eval-direct";
import {
    EvaluationStep,
    createTracing,
    recordTracing,
    Cell,
    SimpleCell,
    BindingSet,
    treeToString,
} from "./eval-tracing";
import { evalCps } from "./eval-cps";
import { createInput, updateInput, reevaluateDataflowGraph, createDataflowNode } from "./dataflow";

interface Frame {
    title: string;
    value: string;
    content: string;
}

function makeResultString(prefix: string, resultCell: Cell, bindings: BindingSet, generation?: number): Frame {
    // return prefix.padEnd(30) + resultCell.value + "\n" + treeToString(resultCell, bindings, { generation: generation });
    return {
        title: prefix,
        value: "" + resultCell.value,
        content: treeToString(resultCell, bindings, { generation: generation }),
    };
}

function showBuildError(e: BuildError, filename: string, input: string): void {
    const sinput = new SourceInput(input);
    const startCoords = sinput.coordsFromLocation(e.range.start);
    const endCoords = sinput.coordsFromLocation(e.range.end);
    console.log(filename + " (" + startCoords.line + "," + startCoords.col + ")-" +
        "(" + endCoords.line + "," + endCoords.col + "): " + e.detail);
    const hltext = sinput.highlightRange(e.range);
    console.log(hltext);
    console.log(e.stack);
}

function showError(prefix: string, e: any, filename: string, input: string): void {
    if (e instanceof SchemeException) {
        if (e.value instanceof ErrorValue)
            showBuildError(e.value.error, filename, input);
        else
            console.log(prefix + e.value);
    }
    else if (e instanceof BuildError) {
        showBuildError(e, filename, input);
    }
    else {
        console.error("" + e);
        console.error("Detail:");
        console.error(e);
    }
}

enum EvalKind {
    None,
    Direct,
    CPS,
    Reactive,
    Tracing,
}

enum Transformations {
    None = 0,
    Simplify = 1,
    CPS = 2,
}

interface Options {
    evalKind: EvalKind;
    testCoordsOnly: boolean;
    prettyPrintOnly: boolean;
    filename: string | null;
    cpsBuiltins: boolean;
    transformations: Transformations;
    abbrev: boolean;
    height: number | null;
}

function parseCommandLineOptions(args: string[]): Options {
    const options: Options = {
        evalKind: EvalKind.None,
        testCoordsOnly: false,
        prettyPrintOnly: false,
        filename: null,
        cpsBuiltins: false,
        transformations: Transformations.Simplify,
        abbrev: false,
        height: null,
    };

    for (let argno = 0; argno < args.length; argno++) {
        if (args[argno].match(/^--/)) {
            if (args[argno] === "--eval-direct") {
                options.evalKind = EvalKind.Direct;
            }
            else if (args[argno] === "--eval-cps") {
                options.evalKind = EvalKind.CPS;
            }
            else if (args[argno] === "--eval-reactive") {
                options.evalKind = EvalKind.Reactive;
            }
            else if (args[argno] === "--eval-tracing") {
                options.evalKind = EvalKind.Tracing;
            }
            else if (args[argno] === "--test") {
                options.testCoordsOnly = true;
            }
            else if (args[argno] === "--pretty-print") {
                options.prettyPrintOnly = true;
            }
            else if (args[argno] === "--plain") {
                options.transformations = Transformations.None;
            }
            else if (args[argno] === "--simplify") {
                options.transformations = Transformations.Simplify;
            }
            else if (args[argno] === "--cps-transform") {
                options.transformations = Transformations.CPS;
            }
            else if (args[argno] === "--cps-builtins") {
                options.cpsBuiltins = true;
            }
            else if (args[argno] === "--abbrev") {
                options.abbrev = true;
            }
            else if ((argno + 1 < args.length) && (args[argno] === "--height")) {
                argno++;
                options.height = parseInt(args[argno]);
            }
            else {
                console.error("Unknown option: " + args[argno]);
                process.exit(1);
            }
        }
        else if (options.filename === null) {
            options.filename = args[argno];
        }
        else {
            console.error("Unexpected argument: " + args[argno]);
            process.exit(1);
        }
    }

    return options;
}

function simplifyProgram(itemList: PairExpr | NilExpr): void {
    let ptr: SExpr = itemList;
    while (ptr instanceof PairExpr) {
        ptr.car = simplify(ptr.car);
        ptr = ptr.cdr;
    }
}

function cpsTransformProgram(itemList: PairExpr | NilExpr): void {
    let ptr: SExpr = itemList;
    while (ptr instanceof PairExpr) {
        ptr.car = ptr.car.cpsTransform(new SymbolExpr(ptr.car.range, "SUCC"));
        ptr = ptr.cdr;
    }
}

function prettyPrintProgram(itemList: PairExpr | NilExpr): void {
    let ptr: SExpr = itemList;
    while (ptr instanceof PairExpr) {
        const output: string[] = [];
        ptr.car.checkForSpecialForms();
        ptr.car.prettyPrint(output, "");
        console.log(output.join(""));
        ptr = ptr.cdr;
    }
}

function main(): void {
    const options = parseCommandLineOptions(process.argv.slice(2));
    if (options.testCoordsOnly) {
        testSourceCoords();
        process.exit(0);
        return;
    }

    const filename = options.filename;
    if (filename === null) {
        console.error("Please specify filename");
        process.exit(1);
        return;
    }

    // const filename = process.argv[2];
    const input = fs.readFileSync(filename, { encoding: "utf-8" });
    const p = new Parser(input);

    try {
        const toplevelScope = new LexicalScope(null);
        for (const name of Object.keys(builtins).sort()) {
            toplevelScope.addOwnSlot(name);
        }
        const itemList = p.parseTopLevel();

        // Apply transformations
        if (options.transformations >= Transformations.Simplify) {
            simplifyProgram(itemList);
        }

        if (options.transformations >= Transformations.CPS) {
            cpsTransformProgram(itemList);
            options.cpsBuiltins = true;
        }

        // Evaluate or print
        if (!(itemList instanceof NilExpr) && (options.evalKind !== EvalKind.None)) {
            const built = buildSequenceFromList(toplevelScope, itemList);

            const topLevelEnv = new Environment(toplevelScope, null);
            const bindings = new BindingSet();

            for (const name of Object.keys(builtins).sort()) {
                const fun = builtins[name];

                const ref = toplevelScope.lookup(name);
                if (ref === null) {
                    throw new Error("No reference for top-level variable " + name);
                }
                const variable = topLevelEnv.variables[ref.index];
                if (options.cpsBuiltins && (ref.name !== "SUCC"))
                    variable.value = new BuiltinProcedureValue(name, wrapBuiltinCPS(fun));
                else
                    variable.value = new BuiltinProcedureValue(name, fun);
                variable.cell = new SimpleCell(variable.value);
                variable.builtin = true;
            }

            if (options.evalKind === EvalKind.Direct) {
                try {
                    const value = evalDirect(built, topLevelEnv);
                    console.log("DIRECT Success: " + value);
                }
                catch (e) {
                    showError("DIRECT Failure: ", e, filename, input);
                }
            }
            else if (options.evalKind === EvalKind.CPS) {
                evalCps(built, topLevelEnv,
                    // success continuation
                    (value: Value): void => {
                        console.log("CPS Success: " + value);
                    },
                    // failure continuation
                    (value: Value): void => {
                        if (value instanceof ErrorValue)
                            showBuildError(value.error, filename, input);
                        else
                            console.log("CPS Failure: " + value);
                    });
            }
            else if (options.evalKind === EvalKind.Reactive) {
                try {
                    disableEvalDirect();
                    let counter = 0;

                    Value.currentGeneration = counter;
                    createInput("test", new NumberValue(counter));
                    const resultNode = createDataflowNode(built, topLevelEnv);
                    resultNode.dump("  * ");
                    console.log("" + resultNode.value);

                    setInterval(() => {
                        try {
                            counter++;
                            Value.currentGeneration = counter;
                            updateInput("test", new NumberValue(counter));
                            reevaluateDataflowGraph();
                            resultNode.dump("  * ");
                            console.log("" + resultNode.value.toStringWithOptions({ generation: Value.currentGeneration }));
                        }
                        catch (e) {
                            console.error("" + e);
                            console.error(e);
                        }
                    }, 1000);
                }
                catch (e) {
                    showError("REACTIVE Failure: ", e, filename, input);
                }
            }
            else if (options.evalKind === EvalKind.Tracing) {
                try {
                    disableEvalDirect();
                    let counter = 0; // tslint:disable-line:prefer-const

                    Value.currentGeneration = 0;
                    createInput("test", new NumberValue(counter));
                    const resultCell = createTracing(built, topLevelEnv);
                    const steps0 = recordTracing(resultCell, () => {
                        resultCell.evaluate();
                    });

                    // Find user variables
                    const varSet = new Set<Variable>();
                    resultCell.findVars(varSet);
                    const allVars = Array.from(varSet).sort((a, b) => { // tslint:disable-line:no-unused-variable
                        if (a.slot.name < b.slot.name)
                            return -1;
                        else if (a.slot.name > b.slot.name)
                            return 1;
                        else
                            return 0;
                    });
                    const userVars = allVars.filter(v => !v.builtin); // tslint:disable-line:no-unused-variable

                    const initialStr = makeResultString("Initial evaluation", resultCell, bindings);
                    Cell.currentGeneration = 1;
                    updateInput("test", new NumberValue(1));

                    const dirty1Str = makeResultString("Dirty 1", resultCell, bindings, 1);

                    const steps1 = recordTracing(resultCell, () => {
                        resultCell.evaluate();
                    });
                    const updated1Str = makeResultString("Updated 1", resultCell, bindings, 1);

                    Cell.currentGeneration = 2;
                    updateInput("test", new NumberValue(2));

                    const dirty2Str = makeResultString("Dirty 2", resultCell, bindings, 2);

                    const steps2 = recordTracing(resultCell, () => {
                        resultCell.evaluate();
                    });
                    const updated2Str = makeResultString("Updated 2", resultCell, bindings, 2);

                    // showFrames([
                    //     initialStr,
                    //     dirty1Str,
                    //     updated1Str,
                    //     dirty2Str,
                    //     updated2Str,
                    // ]);
                    void initialStr; // workaround tslint warnings
                    void dirty1Str; // workaround tslint warnings
                    void updated1Str; // workaround tslint warnings
                    void dirty2Str; // workaround tslint warnings
                    void updated2Str; // workaround tslint warnings

                    const allFrames: Frame[] = [];
                    const iterations: EvaluationStep[][] = [steps0, steps1, steps2];
                    for (let iterationIndex = 0; iterationIndex <= 2; iterationIndex++) {
                        const iteration = iterations[iterationIndex];
                        for (let stepIndex = 0; stepIndex < iteration.length; stepIndex++) {
                            const step = iteration[stepIndex];
                            allFrames.push({
                                title: "Iteration " + iterationIndex + ", step " + stepIndex,
                                value: "#" + step.cell.id + " " + step.cell.name,
                                content: step.content,
                            });
                        }
                    }
                    showFrames(allFrames);
                }
                catch (e) {
                    showError("TRACING Failure: ", e, filename, input);
                }
            }
        }
        else {
            prettyPrintProgram(itemList);
            process.exit(0);
        }
    }
    catch (e) {
        showError("", e, filename, input);
    }
}

main();

function updateScreen(screen: blessed.Widgets.Screen, frame: Frame): void {
    while (screen.children.length > 0)
        screen.remove(screen.children[0]);
    const titleElement = blessed.text({
        top: 0,
        left: 0,
        fg: "red",
        content: frame.title,
    });
    const valueElement = blessed.text({
        top: 0,
        left: 50,
        fg: "blue",
        content: frame.value,
    });
    const contentElement = blessed.text({
        top: 1,
        left: 0,
        // fg: "green",
        content: frame.content,
    });
    screen.append(titleElement);
    screen.append(valueElement);
    screen.append(contentElement);

    // screen.append(blessed.text({ content: frame }));
    screen.render();
}

function showFrames(frames: Frame[]): void {
    if (frames.length === 0) {
        console.error("No frames to display");
        return;
    }

    let frameno = 0;

    const screen = blessed.screen({
      smartCSR: true
    });

    updateScreen(screen, frames[0]);

    // Quit on Escape, q, or Control-C.
    screen.key(["escape", "q", "C-c"], (ch, key) => {
        return process.exit(0);
    });

    screen.key(["["], (ch, key) => {
        if (frameno <= 0)
            return;
        frameno--;
        updateScreen(screen, frames[frameno]);
        screen.render();
    });

    screen.key(["]"], (ch, key) => {
        if (frameno >= frames.length - 1)
            return;
        frameno++;
        updateScreen(screen, frames[frameno]);
        screen.render();
    });
}
