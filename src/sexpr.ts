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

export class SExpr {
    public _class_SExpr: any;
    public constructor() {
    }
}

export class NumberExpr extends SExpr {
    public _class_NumberExpr: any;
    public value: number;
    public constructor(value: number) {
        super();
        this.value = value;
    }
}

export class StringExpr extends SExpr {
    public _class_StringExpr: any;
    public value: string;
    public constructor(value: string) {
        super();
        this.value = value;
    }
}

export class SymbolExpr extends SExpr {
    public _class_SymbolExpr: any;
    public name: string;
    public constructor(name: string) {
        super();
        this.name = name;
    }
}

export class QuoteExpr extends SExpr {
    public _class_QuoteExpr: any;
    public body: SExpr;
    public constructor(body: SExpr) {
        super();
        this.body = body;
    }
}

export class PairExpr extends SExpr {
    public _class_PairExpr: any;
    public car: SExpr;
    public cdr: SExpr;
    public constructor(car: SExpr, cdr: SExpr) {
        super();
        this.car = car;
        this.cdr = cdr;
    }
}

export class NilExpr extends SExpr {
    public _class_NilExpr: any;
    public constructor() {
        super();
    }
}
