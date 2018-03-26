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

import {
    SExpr,
    SymbolExpr,
    PairExpr,
    NilExpr,
    BuildError,
} from "./sexpr";

export interface SpecialFormBase {
    list: PairExpr;
    keyword: SymbolExpr;
}

export interface IfForm extends SpecialFormBase {
    kind: "if";
    condition: SExpr;
    consequent: SExpr;
    alternative: SExpr;
}

export interface QuoteForm extends SpecialFormBase {
    kind: "quote";
    body: SExpr;
}

export interface LambdaForm extends SpecialFormBase {
    kind: "lambda";
    params: SExpr;
    bodyPtr: PairExpr;
}

export interface SetForm extends SpecialFormBase {
    kind: "set!";
    name: SymbolExpr;
    expr: SExpr;
}

export interface BeginForm extends SpecialFormBase {
    kind: "begin";
    bodyList: PairExpr;
}

export interface LetrecDef {
    name: SymbolExpr;
    expr: SExpr;
}

export interface LetrecForm extends SpecialFormBase {
    kind: "letrec";
    defs: LetrecDef[];
    body: SExpr;
}

export interface ThrowForm extends SpecialFormBase {
    kind: "throw";
    expr: SExpr;
}

export interface TryForm extends SpecialFormBase {
    kind: "try";
    tryBody: SExpr;
    catchBody: SExpr;
}

export interface InputForm extends SpecialFormBase {
    kind: "input";
    name: SymbolExpr;
}

export interface ApplyForm {
    list: PairExpr;
    kind: "apply";
}

export type SpecialForm =
    IfForm |
    QuoteForm |
    LambdaForm |
    SetForm |
    BeginForm |
    LetrecForm |
    ThrowForm |
    TryForm |
    InputForm |
    ApplyForm;

export function parseSpecialForm(list: PairExpr): SpecialForm {
    const items = list.toArray();
    if (items.length === 0)
        throw new BuildError(list.range, "Empty list");
    const first = items[0];
    if (first instanceof SymbolExpr) {
        switch (first.name) {
            case "if": {
                if (items.length !== 4)
                    throw new BuildError(first.range, "if requires three arguments");

                const result: IfForm = {
                    list: list,
                    keyword: first,
                    kind: "if",
                    condition: items[1],
                    consequent: items[2],
                    alternative: items[3],
                };
                return result;
            }
            case "quote": {
                if (items.length !== 2)
                    throw new BuildError(first.range, "quote requires exactly one argument");
                const result: QuoteForm = {
                    list: list,
                    keyword: first,
                    kind: "quote",
                    body: items[1],
                };
                return result;
            }
            // case "define": {
            //     if (items.length !== 3)
            //         throw new Error("define requires exactly two arguments");
            //     const formals = items[1];
            //     if (formals instanceof SymbolExpr) {
            //         const innerScope = makeInnerScope(scope, [formals]);
            //         const body = items[2].build(innerScope);
            //         return new DefineNode(formals.name, body);
            //     } else {
            //         const allNames = getFormalParameterNames(formals);
            //         if (allNames.length === 0)
            //             throw new BuildError(first.range, "define is missing name");
            //         const defName = allNames[0];
            //         const paramNames = allNames.slice(1);
            //         const lambda = buildLambda(this.range, scope, paramNames, items[2]);
            //         return new DefineNode(defName.name, lambda);
            //     }
            // }
            case "lambda": {
                // if (items.length !== 3)
                //     throw new BuildError(first.range, "lambda requires exactly two arguments");
                const paramsPtr = list.cdr;
                if (!(paramsPtr instanceof PairExpr))
                    throw new BuildError(first.range, "lambda requires at least two arguments");
                const bodyPtr = paramsPtr.cdr;
                if (!(bodyPtr instanceof PairExpr))
                    throw new BuildError(first.range, "lambda requires at least two arguments");
                const result: LambdaForm = {
                    list: list,
                    keyword: first,
                    kind: "lambda",
                    params: paramsPtr.car,
                    bodyPtr: bodyPtr,
                };
                return result;
            }
            case "set!": {
                if (items.length !== 3)
                    throw new BuildError(first.range, "set! requires exactly two arguments");
                const name = items[1];
                const expr = items[2];
                if (!(name instanceof SymbolExpr))
                    throw new BuildError(name.range, "name must be a symbol");
                const result: SetForm = {
                    list: list,
                    keyword: first,
                    kind: "set!",
                    name: name,
                    expr: expr,
                };
                return result;
            }
            case "begin": {
                if (!(list.cdr instanceof PairExpr))
                    throw new BuildError(first.range, "begin requires at least one argument");
                const result: BeginForm = {
                    list: list,
                    keyword: first,
                    kind: "begin",
                    bodyList: list.cdr,
                };
                return result;
            }
            case "letrec": {
                const varsPtr = list.cdr;
                if (!(varsPtr instanceof PairExpr))
                    throw new BuildError(first.range, "letrec requires exactly two arguments");
                const bodyPtr = varsPtr.cdr;
                if (!(bodyPtr instanceof PairExpr))
                    throw new BuildError(first.range, "letrec requires exactly two arguments");
                if (!(bodyPtr.cdr instanceof NilExpr))
                    throw new BuildError(first.range, "letrec requires exactly two arguments");
                const body = bodyPtr.car;

                const defList = varsPtr.car;
                const defs: LetrecDef[] = [];
                let defItem: SExpr = defList;
                while (defItem instanceof PairExpr) {
                    const item = defItem.car;
                    if (!(item instanceof PairExpr))
                        throw new BuildError(item.range, "expected a list of exactly two items");
                    const firstCar = item.car;
                    const firstCdr = item.cdr;
                    if (!(firstCdr instanceof PairExpr))
                        throw new BuildError(item.range, "expected a list of exactly two items");
                    const secondCar = firstCdr.car;
                    const secondCdr = firstCdr.cdr;
                    if (!(secondCdr instanceof NilExpr))
                        throw new BuildError(item.range, "expected a list of exactly two items");
                    if (!(firstCar instanceof SymbolExpr))
                        throw new BuildError(firstCar.range, "expected a symbol");
                    defs.push({
                        name: firstCar,
                        expr: secondCar,
                    });
                    defItem = defItem.cdr;
                }
                if (!(defItem instanceof NilExpr))
                    throw new BuildError(defList.range, "expected a list");

                const result: LetrecForm = {
                    list: list,
                    keyword: first,
                    kind: "letrec",
                    defs: defs,
                    body: body,
                };
                return result;
            }
            case "throw": {
                if (items.length !== 2)
                    throw new BuildError(first.range, "throw requires exactly one argument");
                const result: ThrowForm = {
                    list: list,
                    keyword: first,
                    kind: "throw",
                    expr: items[1],
                };
                return result;
            }
            case "try": {
                if (items.length !== 3)
                    throw new BuildError(first.range, "try requires exactly two arguments");
                const result: TryForm = {
                    list: list,
                    keyword: first,
                    kind: "try",
                    tryBody: items[1],
                    catchBody: items[2],
                };
                return result;
            }
            case "input": {
                if (items.length !== 2)
                    throw new BuildError(first.range, "input requires exactly one argument");
                const name = items[1];
                if (!(name instanceof SymbolExpr))
                    throw new BuildError(first.range, "input's argument must be a symbol");
                const result: InputForm = {
                    list: list,
                    keyword: first,
                    kind: "input",
                    name: name,
                };
                return result;
            }
            default:
                break;
        }
    }
    const result: ApplyForm = {
        list: list,
        kind: "apply",
    };
    return result;
}
