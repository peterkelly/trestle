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
import { SExpr, PairExpr, NilExpr, BuildError, buildSequenceFromList } from "./sexpr";
import { SourceInput, testSourceCoords } from "./source";
import { LexicalScope } from "./scope";
import { Environment, SchemeException } from "./runtime";
import { Value, ErrorValue } from "./value";
import { BuiltinProcedureValue, builtins } from "./builtins";
import { simplify } from "./simplify";

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

interface Options {
    testCoordsOnly: boolean;
    prettyPrintOnly: boolean;
    simplifyOnly: boolean;
    filename: string | null;
    direct: boolean;
}

function parseCommandLineOptions(args: string[]): Options {
    const options: Options = {
        testCoordsOnly: false,
        prettyPrintOnly: false,
        simplifyOnly: false,
        filename: null,
        direct: false,
    };

    for (let argno = 0; argno < args.length; argno++) {
        if (args[argno].match(/^--/)) {
            if (args[argno] === "--test") {
                options.testCoordsOnly = true;
            }
            else if (args[argno] === "--pretty-print") {
                options.prettyPrintOnly = true;
            }
            else if (args[argno] === "--simplify") {
                options.simplifyOnly = true;
            }
            else if (args[argno] === "--direct") {
                options.direct = true;
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
            console.error("Unknown option: " + args[argno]);
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

        if (options.prettyPrintOnly) {
            prettyPrintProgram(itemList);
            process.exit(0);
        }

        if (options.simplifyOnly) {
            simplifyProgram(itemList);
            prettyPrintProgram(itemList);
            process.exit(0);
        }

        simplifyProgram(itemList);
        if (!(itemList instanceof NilExpr)) {
            // itemList.dump("");
            const built = buildSequenceFromList(toplevelScope, itemList);
            // built.dump("");
            // console.log("========================================");
            const topLevelEnv = new Environment(toplevelScope, null);

            for (const name of Object.keys(builtins).sort()) {
                const fun = builtins[name];

                const ref = toplevelScope.lookup(name);
                if (ref === null) {
                    throw new Error("No reference for top-level variable " + name);
                }
                const variable = topLevelEnv.getVar(ref.index, ref.name, ref.target);
                variable.value = new BuiltinProcedureValue(name, fun);

                // toplevelScope.addOwnSlot(name);
            }

            if (options.direct) {
                try {
                    const value = built.evalDirect(topLevelEnv);
                    console.log("DIRECT Success: " + value);
                }
                catch (e) {
                    if (e instanceof SchemeException) {
                        if (e.value instanceof ErrorValue)
                            showBuildError(e.value.error, filename, input);
                        else
                            console.log("DIRECT Failure: " + e.value);
                    }
                    else {
                        console.error(e);
                    }
                }
            }
            else {
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
        }
    }
    catch (e) {
        if (e instanceof BuildError) {
            showBuildError(e, filename, input);
        }
        else {
            throw e;
        }
    }
}

main();
