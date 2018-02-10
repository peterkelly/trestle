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
import { NilExpr, BuildError, buildSequenceFromList } from "./sexpr";
import { SourceInput, testSourceCoords } from "./source";
import { LexicalScope } from "./scope";
import { Environment, BuiltinProcedureValue, builtins } from "./runtime";
import { Value } from "./value";

// console.log("Hello World");
// const p = new Parser("(test 1 2 3)");
// console.log(p);

function main(): void {
    if (process.argv.length < 3) {
        console.error("Please specify filename");
        process.exit(1);
    }

    if ((process.argv.length >= 3) && (process.argv[2] === "--test")) {
        testSourceCoords();
        process.exit(0);
    }

    const filename = process.argv[2];
    const input = fs.readFileSync(filename, { encoding: "utf-8" });
    const p = new Parser(input);

    try {
        const toplevelScope = new LexicalScope(null);
        for (const name of Object.keys(builtins).sort()) {
            toplevelScope.addOwnSlot(name);
        }
        // toplevelScope.addOwnSlot("+");
        // toplevelScope.addOwnSlot("-");
        // toplevelScope.addOwnSlot("*");
        // toplevelScope.addOwnSlot("/");
        // toplevelScope.addOwnSlot("%");
        // toplevelScope.addOwnSlot("=");
        // toplevelScope.addOwnSlot("!=");
        // toplevelScope.addOwnSlot("<");
        // toplevelScope.addOwnSlot("<=");
        // toplevelScope.addOwnSlot(">");
        // toplevelScope.addOwnSlot(">=");
        // toplevelScope.addOwnSlot("fac");
        const itemList = p.parseTopLevel();
        if (!(itemList instanceof NilExpr)) {
            itemList.dump("");
            const built = buildSequenceFromList(toplevelScope, itemList);
            built.dump("");
            console.log("========================================");
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

            built.evaluate(topLevelEnv,
                // success continuation
                (value: Value): void => {
                    console.log("Success: " + value);
                },
                // failure continuation
                (value: Value): void => {
                    console.log("Failure: " + value);
                });
        }
    }
    catch (e) {
        if (e instanceof BuildError) {
            const sinput = new SourceInput(input);
            const startCoords = sinput.coordsFromLocation(e.range.start);
            const endCoords = sinput.coordsFromLocation(e.range.end);
            console.log(filename + " (" + startCoords.line + "," + startCoords.col + ")-" +
                "(" + endCoords.line + "," + endCoords.col + "): " + e.detail);
            const hltext = sinput.highlightRange(e.range);
            console.log(hltext);
            console.log(e.stack);
        }
        else {
            throw e;
        }
    }
}

main();
