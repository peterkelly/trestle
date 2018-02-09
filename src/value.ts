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

export class Value {
    public _class_Value: any;
    public constructor() {
    }
}

export class BooleanValue extends Value {
    public _class_BooleanValue: any;
    public readonly data: boolean;
    public constructor(data: boolean) {
        super();
        this.data = data;
    }
}

export class SymbolValue extends Value {
    public _class_SymbolValue: any;
    public readonly data: string;
    public constructor(data: string) {
        super();
        this.data = data;
    }
}

export class CharValue extends Value {
    public _class_CharValue: any;
    public readonly data: string;
    public constructor(data: string) {
        super();
        this.data = data;
    }
}

export class VectorValue extends Value {
    public _class_VectorValue: any;
    public constructor() {
        super();
    }
}

export class ProcedureValue extends Value {
    public _class_ProcedureValue: any;
    public constructor() {
        super();
    }
}

export class PairValue extends Value {
    public _class_PairValue: any;
    public car: Value;
    public cdr: Value;
    public constructor(car: Value, cdr: Value) {
        super();
        this.car = car;
        this.cdr = cdr;
    }
}

export class NumberValue extends Value {
    public _class_NumberValue: any;
    public readonly data: number;
    public constructor(data: number) {
        super();
        this.data = data;
    }
}

export class StringValue extends Value {
    public _class_StringValue: any;
    public readonly data: string;
    public constructor(data: string) {
        super();
        this.data = data;
    }
}

export class PortValue extends Value {
    public _class_PortValue: any;
    public constructor() {
        super();
    }
}

export class NilValue extends Value {
    public _class_NilValue: any;
    private constructor() {
        super();
    }
    public static instance = new NilValue();
}
