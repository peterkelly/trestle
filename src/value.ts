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

export abstract class Value {
    public _class_Value: any;

    public constructor() {
    }

    public abstract print(output: string[], visiting: Set<Value>): void;

    public toString(): string {
        const visiting = new Set<Value>();
        const output: string[] = [];
        this.print(output, visiting);
        return output.join("");
    }
}

export class BooleanValue extends Value {
    public _class_BooleanValue: any;
    public readonly data: boolean;

    public constructor(data: boolean) {
        super();
        this.data = data;
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push(this.data ? "#t" : "#f");
    }
}

export class SymbolValue extends Value {
    public _class_SymbolValue: any;
    public readonly data: string;

    public constructor(data: string) {
        super();
        this.data = data;
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("" + this.data);
    }
}

export class CharValue extends Value {
    public _class_CharValue: any;
    public readonly data: string;

    public constructor(data: string) {
        super();
        this.data = data;
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("" + this.data);
    }
}

export class VectorValue extends Value {
    public _class_VectorValue: any;

    public constructor() {
        super();
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("[vector]"); // TODO
    }
}

export class ProcedureValue extends Value {
    public _class_ProcedureValue: any;

    public constructor() {
        super();
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("[procedure]"); // TODO"
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

    public isList(): boolean {
        let item: Value = this;
        while (item instanceof PairValue)
            item = item.cdr;
        return (item instanceof NilValue);
    }

    public print(output: string[], visiting: Set<Value>): void {
        if (visiting.has(this)) {
            output.push("*recursive*");
            return;
        }

        visiting.add(this);
        if (this.isList()) {
            output.push("(");
            let item: Value = this;
            while (item instanceof PairValue) {
                item.car.print(output, visiting);
                if (item.cdr instanceof PairValue)
                    output.push(" ");
                item = item.cdr;
            }
            output.push(")");
        }
        else {
            output.push("(");
            this.car.print(output, visiting);
            output.push(" . ");
            this.cdr.print(output, visiting);
            output.push(")");
        }
        visiting.delete(this);
    }
}

export class NumberValue extends Value {
    public _class_NumberValue: any;
    public readonly data: number;

    public constructor(data: number) {
        super();
        this.data = data;
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("" + this.data);
    }
}

export class StringValue extends Value {
    public _class_StringValue: any;
    public readonly data: string;

    public constructor(data: string) {
        super();
        this.data = data;
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push(JSON.stringify(this.data));
    }
}

export class PortValue extends Value {
    public _class_PortValue: any;

    public constructor() {
        super();
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("[port]");
    }
}

export class NilValue extends Value {
    public _class_NilValue: any;

    private constructor() {
        super();
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("nil");
    }

    public static instance = new NilValue();
}

export class UnspecifiedValue extends Value {
    public _class_UnspecifiedValue: any;

    private constructor() {
        super();
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("*unspecified*");
    }

    public static instance = new UnspecifiedValue();
}
