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
    SourceRange,
} from "./source";
import {
    LetrecDef,
} from "./special-form";
import {
    SExpr,
    PairExpr,
    NilExpr,
    SymbolExpr,
} from "./sexpr";

export function makeList(range: SourceRange, items: SExpr[]): SExpr {
    let result: SExpr = new NilExpr(range);
    for (let i = items.length - 1; i >= 0; i--)
        result = new PairExpr(range, items[i], result);
    return result;
}

export function makeSpecialForm(range: SourceRange, name: string, items: SExpr[]): SExpr {
    items = items.slice();
    items.unshift(new SymbolExpr(range, name));
    return makeList(range, items);
}

export function makeIf(range: SourceRange, condition: SExpr, consequent: SExpr, alternative: SExpr): SExpr {
    return makeSpecialForm(range, "if", [condition, consequent, alternative]);
}

export function makeLambda(range: SourceRange, names: string[], body: SExpr): SExpr {
    const args = makeList(range, names.map(n => new SymbolExpr(range, n)));
    return makeSpecialForm(range, "lambda", [args, body]);
}

export function makeSingularLetrec(range: SourceRange, name: string, value: SExpr, body: SExpr): SExpr {
    const def = makeList(range, [new SymbolExpr(range, name), value]);
    const defList = makeList(range, [def]);
    return makeSpecialForm(range, "letrec", [defList, body]);
}

export function makeLetrec(range: SourceRange, defs: LetrecDef[], body: SExpr): SExpr {
    const defExpressions = defs.map(def => makeList(range, [def.name, def.expr]));
    const defList = makeList(range, defExpressions);
    return makeSpecialForm(range, "letrec", [defList, body]);
}

export function makeSet(range: SourceRange, name: SymbolExpr, expr: SExpr): SExpr {
    return makeSpecialForm(range, "set!", [name, expr]);
}

export function makeBegin(range: SourceRange, expressions: SExpr[]): SExpr {
    return makeSpecialForm(range, "begin", expressions);
}
