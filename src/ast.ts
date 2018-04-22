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

import { SExpr } from "./sexpr";
import { SourceRange } from "./source";
import { LexicalRef, LexicalScope } from "./scope";
import { Value } from "./value";
import { Environment } from "./runtime";

export type Syntax =
    ConstantSyntax |
    TrySyntax |
    ThrowSyntax |
    AssignSyntax |
    IfSyntax |
    LambdaSyntax |
    SequenceSyntax |
    ApplySyntax |
    VariableSyntax |
    LetrecSyntax |
    InputSyntax;

export abstract class SyntaxBase {
    public readonly _class_SyntaxBase: any;
    public readonly range: SourceRange;

    public constructor(range: SourceRange) {
        this.range = range;
    }

    public abstract dump(indent: string): void;
}

export class ConstantSyntax extends SyntaxBase {
    public readonly _class_ConstantSyntax: any;
    public readonly kind: "constant" = "constant";
    public readonly value: SExpr;

    public constructor(range: SourceRange, value: SExpr) {
        super(range);
        this.value = value;
    }

    public dump(indent: string): void {
        console.log(indent + "Constant");
        this.value.dump(indent + "    ");
    }
}

export class TrySyntax extends SyntaxBase {
    public readonly  _class_TrySyntax: any;
    public readonly kind: "try" = "try";
    public readonly tryBody: Syntax;
    public readonly catchBody: LambdaSyntax;

    public constructor(range: SourceRange, tryBody: Syntax, catchBody: LambdaSyntax) {
        super(range);
        this.tryBody = tryBody;
        this.catchBody = catchBody;
    }

    public dump(indent: string): void {
        console.log(indent + "Try-Catch");
        console.log(indent + "    Try");
        this.tryBody.dump(indent + "        ");
        console.log(indent + "    Catch");
        this.catchBody.dump(indent + "        ");
    }
}

export class ThrowSyntax extends SyntaxBase {
    public readonly _class_ThrowSyntax: any;
    public readonly kind: "throw" = "throw";
    public readonly body: Syntax;

    public constructor(range: SourceRange, body: Syntax) {
        super(range);
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Throw");
        this.body.dump(indent + "    ");
    }
}

export class AssignSyntax extends SyntaxBase {
    public readonly _class_AssignSyntax: any;
    public readonly kind: "assign" = "assign";
    public readonly ref: LexicalRef;
    public readonly body: Syntax;

    public constructor(range: SourceRange, ref: LexicalRef, body: Syntax) {
        super(range);
        this.ref = ref;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Assign " + this.ref.target.name + " (" + this.ref.depth + "," + this.ref.index + ")");
        this.body.dump(indent + "    ");
    }
}

export class IfSyntax extends SyntaxBase {
    public readonly _class_IfSyntax: any;
    public readonly kind: "if" = "if";

    public constructor(
        range: SourceRange,
        public condition: Syntax,
        public consequent: Syntax,
        public alternative: Syntax
    ) {
        super(range);
    }

    public dump(indent: string): void {
        console.log(indent + "If");
        this.condition.dump(indent + "    ");
        this.consequent.dump(indent + "    ");
        if (this.alternative)
            this.alternative.dump(indent + "    ");
    }
}

export class LambdaProcedureValue extends Value {
    public _class_LambdaProcedureValue: any;
    public readonly env: Environment;
    public readonly proc: LambdaSyntax;

    public constructor(env: Environment, proc: LambdaSyntax) {
        super();
        this.env = env;
        this.proc = proc;
    }

    public printImpl(output: string[], visiting: Set<Value>): void {
        output.push("<lambda ("  + this.proc.variables.join(" ") + ")>");
    }
}

export class LambdaSyntax extends SyntaxBase {
    public readonly _class_LambdaSyntax: any;
    public readonly kind: "lambda" = "lambda";
    public readonly variables: string[];
    public readonly innerScope: LexicalScope;
    public readonly body: Syntax;

    public constructor(range: SourceRange, variables: string[], innerScope: LexicalScope, body: Syntax) {
        super(range);
        this.variables = variables;
        this.innerScope = innerScope;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Lambda" + this.variables.map(v => " " + v).join(""));
        this.body.dump(indent + "    ");
    }
}

export class SequenceSyntax extends SyntaxBase {
    public readonly _class_SequenceSyntax: any;
    public readonly kind: "sequence" = "sequence";
    public readonly body: Syntax;
    public readonly next: Syntax;

    public constructor(range: SourceRange, body: Syntax, next: Syntax) {
        super(range);
        this.body = body;
        this.next = next;
    }

    public dump(indent: string): void {
        console.log(indent + "Sequence");
        let cur: Syntax = this;
        while (cur instanceof SequenceSyntax) {
            cur.body.dump(indent + "    ");
            cur = cur.next;
        }
        cur.dump(indent + "    ");
    }
}

export class ApplySyntax extends SyntaxBase {
    public readonly _class_ApplySyntax: any;
    public readonly kind: "apply" = "apply";
    public readonly proc: Syntax;
    public readonly args: Syntax[];

    public constructor(range: SourceRange, proc: Syntax, args: Syntax[]) {
        super(range);
        this.proc = proc;
        this.args = args;
    }

    public dump(indent: string): void {
        console.log(indent + "Apply");
        this.proc.dump(indent + "    ");
        for (let i = 0; i < this.args.length; i++) {
            console.log(indent + "    arg " + i);
            this.args[i].dump(indent + "        ");
        }
    }
}

export class VariableSyntax extends SyntaxBase {
    public readonly _class_VariableSyntax: any;
    public readonly kind: "variable" = "variable";
    public readonly ref: LexicalRef;

    public constructor(range: SourceRange, ref: LexicalRef) {
        super(range);
        this.ref = ref;
    }

    public dump(indent: string): void {
        console.log(indent + "Variable " + this.ref.target.name + " (" + this.ref.depth + "," + this.ref.index + ")");
    }
}

export interface LetrecBinding {
    ref: LexicalRef;
    body: Syntax;
}

export class LetrecSyntax extends SyntaxBase {
    public readonly _class_LetrecSyntax: any;
    public readonly kind: "letrec" = "letrec";
    public readonly innerScope: LexicalScope;
    public readonly bindings: LetrecBinding[];
    public readonly body: Syntax;

    public constructor(range: SourceRange, innerScope: LexicalScope, bindings: LetrecBinding[], body: Syntax) {
        super(range);
        this.innerScope = innerScope;
        this.bindings = bindings;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Letrec");
        for (const binding of this.bindings) {
            console.log(indent + "    Binding " + binding.ref.target.name);
            binding.body.dump(indent + "        ");
        }
        console.log(indent + "    Body");
        this.body.dump(indent + "        ");
    }
}

export class InputSyntax extends SyntaxBase {
    public readonly _class_InputSyntax: any;
    public readonly kind: "input" = "input";

    public constructor(range: SourceRange, public name: string) {
        super(range);
    }

    public dump(indent: string): void {
        console.log(indent + "Input " + this.name);
    }
}
