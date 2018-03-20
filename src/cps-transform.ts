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
    IfForm,
    QuoteForm,
    LambdaForm,
    SetForm,
    BeginForm,
    LetrecDef,
    LetrecForm,
} from "./special-form";
import * as extra from "./extra";
import {
    BuildError,
    SExpr,
    LeafExpr,
    SymbolExpr,
    QuoteExpr,
    PairExpr,
    NilExpr,
    UnspecifiedExpr,


    getFormalParameterNames,
} from "./sexpr";

export function skipcp(expr: SExpr): boolean {
    return (expr instanceof LeafExpr);
}

let nextSymId = 0;
export function gensym(prefix?: string): string {
    prefix = prefix || "v";
    return prefix + nextSymId++;
}

export function transformIf(form: IfForm, succ: SExpr): SExpr {
    const range = form.list.range;

    const succSym = (succ instanceof SymbolExpr) ? succ.name : gensym("succ");

    const cpsConsequent = form.consequent.cpsTransform(new SymbolExpr(range, succSym));
    const cpsAlternative = form.alternative.cpsTransform(new SymbolExpr(range, succSym));

    if (skipcp(form.condition)) {
        const body = extra.makeIf(range,
            form.condition, cpsConsequent, cpsAlternative);
        if (succ instanceof SymbolExpr)
            return body;
        else
            return extra.makeSingularLetrec(range, succSym, succ, body);
    }
    else {
        const sym = gensym();

        const body = extra.makeIf(range,
            new SymbolExpr(range, sym),
            cpsConsequent,
            cpsAlternative);

        if (succ instanceof SymbolExpr) {
            return form.condition.cpsTransform(body);
        }
        else {
            return form.condition.cpsTransform(
                extra.makeLambda(range, [sym],
                    extra.makeSingularLetrec(range, succSym, succ, body)));
        }
    }
}

export function transformQuote(form: QuoteForm, succ: SExpr): SExpr {
    return new QuoteExpr(form.list.range, form.body).cpsTransform(succ);
}

export function transformLambda(form: LambdaForm, succ: SExpr): SExpr {
    // FIXME: Support lambda expressions with multiple expressions in their body.
    // This is probably best handled during the simplification stage, so that all such
    // lambda bodies are wrapped in a begin.
    if (!(form.bodyPtr instanceof PairExpr))
        throw new Error("lambda: expected bodyPtr to be a pair");
    if (!(form.bodyPtr.cdr instanceof NilExpr))
        throw new Error("lambda: expected bodyPtr.cdr to be a pair");
    const rawBody = form.bodyPtr.car;

    const range = form.list.range;
    const succSym = gensym("succ");
    const cpsBody = rawBody.cpsTransform(new SymbolExpr(range, succSym));

    const names = getFormalParameterNames(form.params).map(expr => expr.name);
    names.push(succSym);
    const lambda = extra.makeLambda(range, names, cpsBody);
    return extra.makeList(range, [succ, lambda]);
}

export function transformSet(form: SetForm, succ: SExpr): SExpr {
    const range = form.list.range;

    if (skipcp(form.expr)) {
        return extra.makeBegin(range, [
            form.list,
            extra.makeList(range, [succ, new UnspecifiedExpr(range)])
        ]);
    }
    else {
        const tempName = gensym("v");
        const setExpr = extra.makeSet(range, form.name, new SymbolExpr(range, tempName));
        const beginExpr = extra.makeBegin(range, [
            setExpr,
            extra.makeList(range, [succ, new UnspecifiedExpr(range)])
            ]);
        const lambdaExpr = extra.makeLambda(range, [tempName], beginExpr);
        return form.expr.cpsTransform(lambdaExpr);
    }
}

export function transformBegin(form: BeginForm, succ: SExpr): SExpr {
    const range = form.list.range;
    const items = form.bodyList.toArray();

    const names: string[] = [];
    for (let i = 0; i < items.length; i++)
        names[i] = gensym();

    const lastApply = new PairExpr(range,
        succ,
        new PairExpr(range,
            new SymbolExpr(range, names[items.length - 1]),
            new NilExpr(range)));
    let result: SExpr = lastApply;

    for (let i = items.length - 1; i >= 0; i--)
        result = items[i].cpsTransform(extra.makeLambda(range, [names[i]], result));

    return result;
}

export function transformLetrec(form: LetrecForm, succ: SExpr): SExpr {
    const range = form.list.range;
    const newDefs: LetrecDef[] = [];
    for (const oldDef of form.defs) {
        newDefs.push({
            name: oldDef.name,
            expr: new UnspecifiedExpr(range),
        });
    }

    const exprNames: string[] = [];
    for (let i = 0; i < newDefs.length; i++)
        exprNames.push(gensym("v"));

    let body: SExpr = form.body.cpsTransform(succ);

    for (let i = newDefs.length - 1; i >= 0; i--) {
        const setExpr = extra.makeSet(range, newDefs[i].name, new SymbolExpr(range, exprNames[i]));
        const beginExpr = extra.makeBegin(range, [setExpr, body]);
        const lambdaExpr = extra.makeLambda(range, [exprNames[i]], beginExpr);
        body = form.defs[i].expr.cpsTransform(lambdaExpr);
    }

    return extra.makeLetrec(range, newDefs, body);
}

export function transformApply(list: PairExpr, succ: SExpr): SExpr {
    const range = list.range;
    const items = list.toArray();
    if (items.length === 0)
        throw new BuildError(range, "Empty list");
    const letSymbols: string[] = [];
    for (let i = 0; i < items.length; i++) {
        if (skipcp(items[i]))
            letSymbols.push("---SKIP---");
        else
            letSymbols.push(gensym());
    }

    let applyExpr: SExpr = new NilExpr(range);
    applyExpr = new PairExpr(range, succ, applyExpr);

    for (let i = items.length - 1; i >= 0; i--) {
        const arg = skipcp(items[i]) ? items[i] : new SymbolExpr(range, letSymbols[i]);
        applyExpr = new PairExpr(range, arg, applyExpr);
    }

    let result: SExpr = applyExpr;
    for (let i = items.length - 1; i >= 0; i--) {
        if (!skipcp(items[i])) {
            result = items[i].cpsTransform(
                extra.makeLambda(range, [letSymbols[i]], result));
        }
    }
    return result;
}
