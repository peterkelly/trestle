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
    ASTNode,
    ConstantNode,
    VariableNode,
    IfNode,
    // DefineNode,
    LambdaNode,
    ApplyNode,
    AssignNode,
    SequenceNode,
    LetrecBinding,
    LetrecNode,
    TryNode,
    ThrowNode,
    InputNode,
} from "./ast";
import {
    SourceRange,
} from "./source";
import {
    LexicalRef,
    LexicalScope,
} from "./scope";
import {
    Value,
    BooleanValue,
    NumberValue,
    StringValue,
    SymbolValue,
    PairValue,
    NilValue,
    UnspecifiedValue,
} from "./value";
import {
    parseSpecialForm,
    LetrecDef,
} from "./special-form";
import * as cps from "./cps-transform";

type Transform = (expr: SExpr) => SExpr;

export class BuildError extends Error {
    public readonly range: SourceRange;
    public readonly detail: string;

    public constructor(range: SourceRange, detail: string) {
        super(range + ": " + detail);
        this.range = range;
        this.detail = detail;
    }
}

export abstract class SExpr {
    public _class_SExpr: any;
    public range: SourceRange;
    public containsSpecialForm = false;

    public constructor(range: SourceRange) {
        this.range = range;
    }

    public get children(): SExpr[] {
        return [];
    }

    public abstract transform(transformer: Transform): SExpr;

    public abstract toValue(): Value;

    public abstract checkForSpecialForms(): boolean;

    public abstract dump(indent: string): void;

    public abstract prettyPrint(output: string[], indent: string): void;

    public abstract cpsTransform(succ: SExpr): SExpr;

    public abstract build(scope: LexicalScope): ASTNode;

    public pair(car: SExpr, cdr: SExpr): PairExpr {
        return new PairExpr(this.range, car, cdr);
    }
}

export abstract class LeafExpr extends SExpr {
    public cpsTransform(succ: SExpr): SExpr {
        const range = this.range;
        return new PairExpr(range,
            succ,
            new PairExpr(range,
                this,
                new NilExpr(range)));
    }
}

export class BooleanExpr extends LeafExpr {
    public _class_BooleanExpr: any;
    public value: boolean;

    public constructor(range: SourceRange, value: boolean) {
        super(range);
        this.value = value;
    }

    public transform(transformer: Transform): SExpr {
        return this;
    }

    public toValue(): Value {
        return new BooleanValue(this.value);
    }

    public checkForSpecialForms(): boolean {
        return false;
    }

    public dump(indent: string): void {
        console.log(indent + "BOOLEAN " + this.value);
    }

    public prettyPrint(output: string[], indent: string): void {
        if (this.value)
            output.push("#t");
        else
            output.push("#f");
    }

    public build(scope: LexicalScope): ASTNode {
        return new ConstantNode(this.range, this);
    }
}

export class NumberExpr extends LeafExpr {
    public _class_NumberExpr: any;
    public value: number;

    public constructor(range: SourceRange, value: number) {
        super(range);
        this.value = value;
    }

    public transform(transformer: Transform): SExpr {
        return this;
    }

    public toValue(): Value {
        return new NumberValue(this.value);
    }

    public checkForSpecialForms(): boolean {
        return false;
    }

    public dump(indent: string): void {
        console.log(indent + "NUMBER " + this.value);
    }

    public prettyPrint(output: string[], indent: string): void {
        output.push("" + this.value);
    }

    public build(scope: LexicalScope): ASTNode {
        return new ConstantNode(this.range, this);
    }
}

export class StringExpr extends LeafExpr {
    public _class_StringExpr: any;
    public value: string;

    public constructor(range: SourceRange, value: string) {
        super(range);
        this.value = value;
    }

    public transform(transformer: Transform): SExpr {
        return this;
    }

    public checkForSpecialForms(): boolean {
        return false;
    }

    public toValue(): Value {
        return new StringValue(this.value);
    }

    public dump(indent: string): void {
        console.log(indent + "STRING " + JSON.stringify(this.value));
    }

    public prettyPrint(output: string[], indent: string): void {
        output.push(JSON.stringify(this.value));
    }

    public build(scope: LexicalScope): ASTNode {
        return new ConstantNode(this.range, this);
    }
}

export class SymbolExpr extends LeafExpr {
    public _class_SymbolExpr: any;
    public name: string;

    public constructor(range: SourceRange, name: string) {
        super(range);
        this.name = name;
    }

    public transform(transformer: Transform): SExpr {
        return this;
    }

    public checkForSpecialForms(): boolean {
        return false;
    }

    public toValue(): Value {
        return new SymbolValue(this.name);
    }

    public dump(indent: string): void {
        console.log(indent + "SYMBOL " + this.name);
    }

    public prettyPrint(output: string[], indent: string): void {
        output.push(this.name);
    }

    public build(scope: LexicalScope): ASTNode {
        const ref = scope.lookup(this.name);
        if (ref === null)
            throw new BuildError(this.range, "symbol not found: " + this.name);
        return new VariableNode(this.range, ref);
    }
}

export class QuoteExpr extends LeafExpr {
    public _class_QuoteExpr: any;
    public body: SExpr;

    public constructor(range: SourceRange, body: SExpr) {
        super(range);
        this.body = body;
    }

    public get children(): SExpr[] {
        return [this.body];
    }

    public transform(transformer: Transform): SExpr {
        const newBody = this.body.transform(transformer);
        if (newBody !== this.body)
            return new QuoteExpr(this.range, newBody);
        else
            return this;
    }

    public checkForSpecialForms(): boolean {
        this.containsSpecialForm = this.body.checkForSpecialForms();
        return this.containsSpecialForm;
    }

    public toValue(): Value {
        return new PairValue(new SymbolValue("quote"), this.body.toValue());
    }

    public dump(indent: string): void {
        console.log(indent + "QUOTE");
        this.body.dump(indent + "    ");
    }

    public prettyPrint(output: string[], indent: string): void {
        output.push("(quote ");
        this.body.prettyPrint(output, indent + "    ");
        output.push(")");
    }

    public build(scope: LexicalScope): ASTNode {
        return new ConstantNode(this.range, this.body);
    }
}

export class PairExpr extends SExpr {
    public _class_PairExpr: any;
    public car: SExpr;
    public cdr: SExpr;
    private firstNewlineIndex = 0;

    public constructor(range: SourceRange, car: SExpr, cdr: SExpr) {
        super(range);
        this.car = car;
        this.cdr = cdr;
    }

    public transform(transformer: Transform): SExpr {
        const newCar = this.car.transform(transformer);
        const newCdr = this.cdr.transform(transformer);
        if ((newCar !== this.car) || (newCdr !== this.cdr))
            return transformer(new PairExpr(this.range, newCar, newCdr));
        else
            return transformer(this);
    }

    public get children(): SExpr[] {
        return [this.car, this.cdr];
    }

    public toValue(): Value {
        return new PairValue(this.car.toValue(), this.cdr.toValue());
    }

    public checkForSpecialForms(): boolean {
        const carHas = this.car.checkForSpecialForms();
        const cdrHas = this.cdr.checkForSpecialForms();
        this.containsSpecialForm = carHas || cdrHas;

        if (this.car instanceof SymbolExpr) {
            const keyword = this.car.name;
            if ((keyword === "letrec") ||
                (keyword === "lambda") ||
                (keyword === "if") ||
                (keyword === "begin") ||
                (keyword === "define") ||
                (keyword === "cond"))
                this.containsSpecialForm = true;

            if (keyword === "lambda") {
                this.firstNewlineIndex = 2;
            }
            else if (keyword === "if") {
                this.firstNewlineIndex = 2;
            }
        }

        return this.containsSpecialForm;
    }

    public dump(indent: string): void {
        console.log(indent + "PAIR");
        this.car.dump(indent + "    ");
        this.cdr.dump(indent + "    ");
    }

    public isList(): boolean {
        let ptr: SExpr = this;
        while (ptr instanceof PairExpr)
            ptr = ptr.cdr;
        return (ptr instanceof NilExpr);
    }

    public isSimpleList(): boolean {
        let complex = false;
        let ptr: SExpr = this;
        while (ptr instanceof PairExpr) {
            if (ptr.car instanceof PairExpr)
                complex = true;
            ptr = ptr.cdr;
        }
        return !complex && (ptr instanceof NilExpr);
    }

    public prettyPrint(output: string[], indent: string): void {
        if (this.isList()) {
            let keyword: string | null = null;
            if (this.car instanceof SymbolExpr)
                keyword = this.car.name;

            let pair: SExpr = this;
            output.push("(");
            let index = 0;
            while (pair instanceof PairExpr) {
                let childIndent = "    ";

                if ((keyword === "letrec") && (index === 1))
                    childIndent = "";

                pair.car.prettyPrint(output, indent + childIndent);
                if (pair.cdr instanceof PairExpr) {
                    if (this.containsSpecialForm && (index + 1 >= this.firstNewlineIndex))
                        output.push("\n" + indent + "    ");
                    else
                        output.push(" ");
                }
                pair = pair.cdr;
                index++;
            }
            output.push(")");
        }
        else {
            output.push("(");
            this.car.prettyPrint(output, indent + "    ");
            output.push(" . ");
            this.cdr.prettyPrint(output, indent + "    ");
            output.push(")");
        }
    }

    public toArray(): SExpr[] {
        const items: SExpr[] = [];
        let p: SExpr = this;
        while (p instanceof PairExpr) {
            items.push(p.car);
            p = p.cdr;
        }
        if (!(p instanceof NilExpr))
            throw new BuildError(this.range, "Pair is not a list");
        return items;
    }

    public cpsTransform(succ: SExpr): SExpr {
        const form = parseSpecialForm(this);
        switch (form.kind) {
            case "if":
                return cps.transformIf(form, succ);
            case "quote":
                return cps.transformQuote(form, succ);
            case "lambda":
                return cps.transformLambda(form, succ);
            case "set!":
                return cps.transformSet(form, succ);
            case "begin":
                return cps.transformBegin(form, succ);
            case "letrec":
                return cps.transformLetrec(form, succ);
            case "apply":
                return cps.transformApply(this, succ);
            case "throw":
                throw new Error("throw: cpsTransform not implemented");
            case "try":
                throw new Error("try: cpsTransform not implemented");
            // case "define": // TODO
            //     break;
            default:
                throw new BuildError(this.car.range, "Unknown special form");
        }
    }

    public build(scope: LexicalScope): ASTNode {
        const form = parseSpecialForm(this);
        switch (form.kind) {
            case "if": {
                const condition = form.condition.build(scope);
                const consequent = form.consequent.build(scope);
                const alternative = form.alternative.build(scope);
                return new IfNode(this.range, condition, consequent, alternative);
            }
            case "quote":
                return new ConstantNode(this.range, form.body);
            case "lambda": {
                const names = getFormalParameterNames(form.params);
                return buildLambda(this.range, scope, names, form.bodyPtr);
            }
            // case "define": // TODO
            //     break;
            case "set!": {
                const name = form.name;
                const body = form.expr.build(scope);
                const ref = scope.lookup(name.name);
                if (ref === null)
                    throw new BuildError(name.range, "symbol not found: " + name.name);
                return new AssignNode(this.range, ref, body);
            }
            case "begin":
                return buildSequenceFromList(scope, form.bodyList);
            case "letrec": {
                const inner = new LexicalScope(scope);
                const bindings = buildLetrecDefs(inner, form.defs);
                const body = form.body.build(inner);
                return new LetrecNode(this.range, inner, bindings, body);
            }
            case "throw": {
                const expr = form.expr.build(scope);
                return new ThrowNode(this.range, expr);
            }
            case "try": {
                const tryBody = form.tryBody.build(scope);
                const catchBody = form.catchBody.build(scope);
                if (!(catchBody instanceof LambdaNode))
                    throw new BuildError(form.catchBody.range, "catch must be a lambda expression");
                if (catchBody.variables.length !== 1)
                    throw new BuildError(form.catchBody.range, "catch must accept exactly one argument");
                return new TryNode(this.range, tryBody, catchBody);
            }
            case "input":
                return new InputNode(this.range, form.name.name);
            case "apply":
                break;
            default:
                throw new BuildError(this.car.range, "Unknown special form");
        }

        const items = this.toArray();
        if (items.length === 0)
            throw new BuildError(this.range, "Empty list");
        const first = items[0];
        const proc = first.build(scope);
        const args = items.slice(1).map(a => a.build(scope));
        return new ApplyNode(this.range, proc, args);
    }
}

function buildLetrecDefs(inner: LexicalScope, defs: LetrecDef[]): LetrecBinding[] {
    const result: LetrecBinding[] = [];

    const prepared: { ref: LexicalRef, body: SExpr }[] = [];
    for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        const nameExpr = def.name;
        const name = nameExpr.name;
        if (inner.hasOwnSlot(name))
            throw new BuildError(nameExpr.range, "duplicate variable definition: " + name);
        const ref = inner.addOwnSlot(name);
        prepared.push({
            ref: ref,
            body: def.expr,
        });
    }

    for (const def of prepared) {
        const ref = def.ref;
        const body = def.body.build(inner);
        result.push({ ref, body });
    }
    return result;
}

export function buildSequenceFromList(scope: LexicalScope, list: PairExpr): ASTNode {
    const first = list.car.build(scope);
    if (list.cdr instanceof NilExpr) {
        return first;
    }
    else if (list.cdr instanceof PairExpr) {
        const rest = buildSequenceFromList(scope, list.cdr);
        return new SequenceNode(list.range, first, rest);
    }
    else {
        throw new BuildError(list.cdr.range, "Expected a list");
    }
}

function buildLambda(range: SourceRange, scope: LexicalScope, names: SymbolExpr[], body: PairExpr): LambdaNode {
    const innerScope = makeInnerScope(scope, names);
    const bodyNode = buildSequenceFromList(innerScope, body);
    return new LambdaNode(range, names.map(e => e.name), innerScope, bodyNode);
}

function makeInnerScope(outer: LexicalScope, symbols: SymbolExpr[]): LexicalScope {
    const innerScope = new LexicalScope(outer);
    for (const sym of symbols) {
        if (innerScope.hasOwnSlot(sym.name))
            throw new BuildError(sym.range, "Duplicate parameter name: " + sym.name);
        innerScope.addOwnSlot(sym.name);
    }
    return innerScope;
}

export function getFormalParameterNames(start: SExpr): SymbolExpr[] {
    const result: SymbolExpr[] = [];
    let item = start;
    while (item instanceof PairExpr) {
        if (!(item.car instanceof SymbolExpr))
            throw new BuildError(item.car.range, "Formal parameter must be a symbol");
        result.push(item.car);
        item = item.cdr;
    }
    if (!(item instanceof NilExpr))
        throw new BuildError(start.range, "Formal parameters must be a list of symbols");
    return result;
}

export class NilExpr extends LeafExpr {
    public _class_NilExpr: any;

    public constructor(range: SourceRange) {
        super(range);
    }

    public transform(transformer: Transform): SExpr {
        return this;
    }

    public toValue(): Value {
        return NilValue.instance;
    }

    public checkForSpecialForms(): boolean {
        return false;
    }

    public dump(indent: string): void {
        console.log(indent + "NIL");
    }

    public prettyPrint(output: string[], indent: string): void {
        output.push("'()");
    }

    public build(scope: LexicalScope): ASTNode {
        throw new BuildError(this.range, "Unexpected nil");
    }
}

export class UnspecifiedExpr extends LeafExpr {
    public _class_UnspecifiedExpr: any;

    public constructor(range: SourceRange) {
        super(range);
    }

    public transform(transformer: Transform): SExpr {
        return this;
    }

    public toValue(): Value {
        return UnspecifiedValue.instance;
    }

    public checkForSpecialForms(): boolean {
        return false;
    }

    public dump(indent: string): void {
        console.log(indent + "UNSPECIFIED");
    }

    public prettyPrint(output: string[], indent: string): void {
        output.push("*unspecified*");
    }

    public build(scope: LexicalScope): ASTNode {
        return new ConstantNode(this.range, this);
    }
}
