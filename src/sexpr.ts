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
    DefineNode,
    LambdaNode,
    ApplyNode,
} from "./ast";
import {
    SourceRange,
} from "./source";

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

    public constructor(range: SourceRange) {
        this.range = range;
    }

    public abstract dump(indent: string): void;

    public abstract build(): ASTNode;
}

export class NumberExpr extends SExpr {
    public _class_NumberExpr: any;
    public value: number;

    public constructor(range: SourceRange, value: number) {
        super(range);
        this.value = value;
    }

    public dump(indent: string): void {
        console.log(indent + "NUMBER " + this.value);
    }

    public build(): ASTNode {
        return new ConstantNode(this);
    }
}

export class StringExpr extends SExpr {
    public _class_StringExpr: any;
    public value: string;

    public constructor(range: SourceRange, value: string) {
        super(range);
        this.value = value;
    }

    public dump(indent: string): void {
        console.log(indent + "STRING " + JSON.stringify(this.value));
    }

    public build(): ASTNode {
        return new ConstantNode(this);
    }
}

export class SymbolExpr extends SExpr {
    public _class_SymbolExpr: any;
    public name: string;

    public constructor(range: SourceRange, name: string) {
        super(range);
        this.name = name;
    }

    public dump(indent: string): void {
        console.log(indent + "SYMBOL " + this.name);
    }

    public build(): ASTNode {
        return new VariableNode(this.name);
    }
}

export class QuoteExpr extends SExpr {
    public _class_QuoteExpr: any;
    public body: SExpr;

    public constructor(range: SourceRange, body: SExpr) {
        super(range);
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "QUOTE");
        this.body.dump(indent + "    ");
    }

    public build(): ASTNode {
        return new ConstantNode(this);
    }
}

export class PairExpr extends SExpr {
    public _class_PairExpr: any;
    public car: SExpr;
    public cdr: SExpr;

    public constructor(range: SourceRange, car: SExpr, cdr: SExpr) {
        super(range);
        this.car = car;
        this.cdr = cdr;
    }

    public dump(indent: string): void {
        console.log(indent + "PAIR");
        this.car.dump(indent + "    ");
        this.cdr.dump(indent + "    ");
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

    public build(): ASTNode {
        const items = this.toArray();
        if (items.length === 0)
            throw new BuildError(this.range, "Empty list");
        const first = items[0];
        if (first instanceof SymbolExpr) {
            switch (first.name) {
                case "if": {
                    if ((items.length !== 3) && (items.length !== 4)) {
                        throw new BuildError(first.range, "if requires two or three arguments");
                    }
                    const condition = items[1].build();
                    const consequent = items[2].build();
                    const alternative = (items.length === 4) ? items[3].build() : null;

                    return new IfNode(condition, consequent, alternative);
                }
                case "quote": {
                    if (items.length !== 2)
                        throw new BuildError(first.range, "quote requires exactly one argument");
                    return new ConstantNode(items[2]);
                }
                case "define": {
                    if (items.length !== 3)
                        throw new Error("define requires exactly two arguments");
                    const formals = items[1];
                    const body = items[2].build();
                    if (formals instanceof SymbolExpr) {
                        return new DefineNode(formals.name, body);
                    } else {
                        const allNames = getFormalParameterNames(formals);
                        if (allNames.length === 0)
                            throw new BuildError(first.range, "define is missing name");
                        const defName = allNames[0];
                        const paramNames = allNames.slice(1);
                        const lambda = new LambdaNode(paramNames, body);
                        return new DefineNode(defName, lambda);
                    }
                }
                case "lambda": {
                    if (items.length !== 3)
                        throw new BuildError(first.range, "lambda requires exactly two arguments");
                    const names = getFormalParameterNames(items[1]);
                    const body = items[2].build();
                    return new LambdaNode(names, body);
                }
                default: {
                }
            }
            const proc = first.build();
            const args = items.slice(1).map(a => a.build());
            return new ApplyNode(proc, args);
        }
        throw new BuildError(this.range, "Unknown special form");
    }
}

function getFormalParameterNames(start: SExpr): string[] {
    const result: string[] = [];
    let item = start;
    while (item instanceof PairExpr) {
        if (!(item.car instanceof SymbolExpr))
            throw new BuildError(item.car.range, "Formal parameter must be a symbol");
        result.push(item.car.name);
        item = item.cdr;
    }
    if (!(item instanceof NilExpr))
        throw new BuildError(start.range, "Formal parameters must be a list of symbols");
    return result;
}

export class NilExpr extends SExpr {
    public _class_NilExpr: any;

    public constructor(range: SourceRange) {
        super(range);
    }

    public dump(indent: string): void {
        console.log(indent + "NIL");
    }

    public build(): ASTNode {
        throw new BuildError(this.range, "Unexpected nil");
    }
}
