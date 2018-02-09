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
import { SExpr, PairExpr } from "./sexpr";

// console.log("Hello World");
// const p = new Parser("(test 1 2 3)");
// console.log(p);

function main(): void {
    if (process.argv.length < 3) {
        console.error("Please specify filename");
        process.exit(1);
    }

    const filename = process.argv[2];
    const inputRaw = fs.readFileSync(filename, { encoding: "utf-8" });
    const input = "(" + inputRaw + ")";
    const p = new Parser(input);
    let list: SExpr = p.parseList();
    while (list instanceof PairExpr) {
        list.car.dump("");
        list = list.cdr;
    }
}

main();
