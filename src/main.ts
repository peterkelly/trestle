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
import { Parser } from "./parse";
import { SExpr, SymbolExpr, PairExpr, NilExpr, BuildError, buildSequenceFromList } from "./sexpr";
import { SourceInput, testSourceCoords } from "./source";
import { LexicalScope } from "./scope";
import { Environment, SchemeException } from "./runtime";
import { Value, NumberValue, ErrorValue } from "./value";
import { BuiltinProcedureValue, builtins, wrapBuiltinCPS } from "./builtins";
import { simplify } from "./simplify";
import { disableEvalDirect } from "./ast";
import { createInput } from "./dataflow";

// console.log("Hello World");
// const p = new Parser("(test 1 2 3)");
// console.log(p);

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
}

function parseCommandLineOptions(args: string[]): Options {
    const options: Options = {
        evalKind: EvalKind.None,
        testCoordsOnly: false,
        prettyPrintOnly: false,
        filename: null,
        cpsBuiltins: false,
        transformations: Transformations.Simplify,
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

            for (const name of Object.keys(builtins).sort()) {
                const fun = builtins[name];

                const ref = toplevelScope.lookup(name);
                if (ref === null) {
                    throw new Error("No reference for top-level variable " + name);
                }
                const variable = topLevelEnv.getVar(ref.index, ref.name, ref.target);
                if (options.cpsBuiltins && (ref.name !== "SUCC"))
                    variable.value = new BuiltinProcedureValue(name, wrapBuiltinCPS(fun));
                else
                    variable.value = new BuiltinProcedureValue(name, fun);
            }

            if (options.evalKind === EvalKind.Direct) {
                try {
                    const value = built.evalDirect(topLevelEnv);
                    console.log("DIRECT Success: " + value);
                }
                catch (e) {
                    showError("DIRECT Failure: ", e, filename, input);
                }
            }
            else if (options.evalKind === EvalKind.CPS) {
                built.evalCps(topLevelEnv,
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
                    const counter = 0;
                    createInput("test", new NumberValue(counter));
                    const resultNode = built.createDataflowNode(topLevelEnv);
                    console.log("REACTIVE Success: " + resultNode.value);
                }
                catch (e) {
                    showError("REACTIVE Failure: ", e, filename, input);
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
