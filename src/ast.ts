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
import { LexicalRef, LexicalScope } from "./scope";

export abstract class ASTNode {
    public _class_ASTNode: any;

    public constructor() {
    }

    public abstract dump(indent: string): void;
}

export class ConstantNode extends ASTNode {
    public _class_ConstantNode: any;
    public value: SExpr;
    public constructor(value: SExpr) {
        super();
        this.value = value;
    }

    public dump(indent: string): void {
        console.log(indent + "Constant");
        this.value.dump(indent + "    ");
    }
}

// export class QuoteNode extends ASTNode {
//     public _class_QuoteNode: any;

//     public constructor() {
//         super();
//     }
// }

export class AssignNode extends ASTNode {
    public _class_AssignNode: any;
    public ref: LexicalRef;
    public body: ASTNode;
    public constructor(ref: LexicalRef, body: ASTNode) {
        super();
        this.ref = ref;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Assign " + this.ref.target.name + " (" + this.ref.depth + "," + this.ref.index + ")");
        this.body.dump(indent + "    ");
    }
}

export class DefineNode extends ASTNode {
    public _class_DefineNode: any;
    public name: string;
    public body: ASTNode;

    public constructor(name: string, body: ASTNode) {
        super();
        this.name = name;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Define " + this.name);
        this.body.dump(indent + "    ");
    }
}

export class IfNode extends ASTNode {
    public _class_IfNode: any;

    public constructor(
        public condition: ASTNode,
        public consequent: ASTNode,
        public alternative: ASTNode | null
    ) {
        super();
    }

    public dump(indent: string): void {
        console.log(indent + "If");
        this.condition.dump(indent + "    ");
        this.consequent.dump(indent + "    ");
        if (this.alternative)
            this.alternative.dump(indent + "    ");
    }
}

export class LambdaNode extends ASTNode {
    public _class_LambdaNode: any;
    public variables: string[];
    public body: ASTNode;

    public constructor(variables: string[], body: ASTNode) {
        super();
        this.variables = variables;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Lambda" + this.variables.map(v => " " + v).join(" "));
        this.body.dump(indent + "    ");
    }
}

export class SequenceNode extends ASTNode {
    public _class_SequenceNode: any;
    public body: ASTNode;
    public next: ASTNode;

    public constructor(body: ASTNode, next: ASTNode) {
        super();
        this.body = body;
        this.next = next;
    }

    public dump(indent: string): void {
        console.log(indent + "Sequence");
        let cur: ASTNode = this;
        while (cur instanceof SequenceNode) {
            cur.body.dump(indent + "    ");
            cur = cur.next;
        }
        cur.dump(indent + "    ");
    }
}

// export class CondNode extends ASTNode {
//     public _class_CondNode: any;
//     public constructor() {
//         super();
//     }
// }

export class ApplyNode extends ASTNode {
    public _class_ApplyNode: any;
    public proc: ASTNode;
    public args: ASTNode[];

    public constructor(proc: ASTNode, args: ASTNode[]) {
        super();
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

export class VariableNode extends ASTNode {
    public _class_VariableNode: any;
    public ref: LexicalRef;

    public constructor(ref: LexicalRef) {
        super();
        this.ref = ref;
    }

    public dump(indent: string): void {
        console.log(indent + "Variable " + this.ref.target.name + " (" + this.ref.depth + "," + this.ref.index + ")");
    }
}

export interface LetrecBinding {
    ref: LexicalRef;
    body: ASTNode;
}

export class LetrecNode extends ASTNode {
    public _class_LetrecNode: any;
    public scope: LexicalScope;
    public bindings: LetrecBinding[];
    public body: ASTNode;

    public constructor(scope: LexicalScope, bindings: LetrecBinding[], body: ASTNode) {
        super();
        this.scope = scope;
        this.bindings = bindings;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Letrec");
        for (const binding of this.bindings) {
            console.log(indent + "    Binding " + binding.ref.target.name);
            binding.body.dump(indent + "        ");
        }
    }
}
