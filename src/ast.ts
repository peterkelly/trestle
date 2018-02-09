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

export class ASTNode {
    public _class_ASTNode: any;
    public constructor() {
    }
}

export class ConstantNode extends ASTNode {
    public _class_ConstantNode: any;
    public value: SExpr;
    public constructor(value: SExpr) {
        super();
        this.value = value;
    }
}

export class QuoteNode extends ASTNode {
    public _class_QuoteNode: any;
    public constructor() {
        super();
    }
}

export class AssignNode extends ASTNode {
    public _class_AssignNode: any;
    public constructor() {
        super();
    }
}

export class DefineNode extends ASTNode {
    public _class_DefineNode: any;
    public constructor() {
        super();
    }
}

export class IfNode extends ASTNode {
    public _class_IfNode: any;
    public constructor() {
        super();
    }
}

export class LambdaNode extends ASTNode {
    public _class_LambdaNode: any;
    public constructor() {
        super();
    }
}

export class BeginNode extends ASTNode {
    public _class_BeginNode: any;
    public constructor() {
        super();
    }
}

export class CondNode extends ASTNode {
    public _class_CondNode: any;
    public constructor() {
        super();
    }
}

export class ApplyNode extends ASTNode {
    public _class_ApplyNode: any;
    public constructor() {
        super();
    }
}
