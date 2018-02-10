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

// export class AssignNode extends ASTNode {
//     public _class_AssignNode: any;
//     public constructor() {
//         super();
//     }
// }

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

// export class BeginNode extends ASTNode {
//     public _class_BeginNode: any;
//     public constructor() {
//         super();
//     }
// }

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
    public name: string;

    public constructor(name: string) {
        super();
        this.name = name;
    }

    public dump(indent: string): void {
        console.log(indent + "Variable " + this.name);
    }
}
