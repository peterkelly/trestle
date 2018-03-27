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

import { BuildError } from "./sexpr";

export interface PrintOptions {
    generation?: number;
    inGeneration?: boolean;
}

export abstract class Value {
    public _class_Value: any;
    public static currentGeneration: number = 0;
    public generation: number;

    public constructor() {
        this.generation = Value.currentGeneration;
    }

    public abstract printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void;

    public print(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        const showGeneration =
            (options.generation !== undefined) &&
            (options.generation === this.generation) &&
            !options.inGeneration;
        if (showGeneration)
            output.push("\x1b[7m");
        this.printImpl(output, visiting, {
            generation: options.generation,
            inGeneration: showGeneration || options.inGeneration,
        });
        if (showGeneration)
            output.push("\x1b[0m");
    }

    public toString(): string {
        return this.toStringWithOptions({});
    }

    public toStringWithOptions(options: PrintOptions): string {
        const visiting = new Set<Value>();
        const output: string[] = [];
        this.print(output, visiting, options);
        return output.join("");
    }

    public isTrue(): boolean {
        return true;
    }
}

export class BooleanValue extends Value {
    public _class_BooleanValue: any;
    public readonly data: boolean;

    public constructor(data: boolean) {
        super();
        this.data = data;
    }

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        output.push(this.data ? "#t" : "#f");
    }

    public isTrue(): boolean {
        return this.data;
    }
}

export class SymbolValue extends Value {
    public _class_SymbolValue: any;
    public readonly data: string;

    public constructor(data: string) {
        super();
        this.data = data;
    }

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
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

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        output.push("" + this.data);
    }
}

export class VectorValue extends Value {
    public _class_VectorValue: any;

    public constructor() {
        super();
    }

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        output.push("[vector]"); // TODO
    }
}

export class ProcedureValue extends Value {
    public _class_ProcedureValue: any;

    public constructor() {
        super();
    }

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
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

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        if (visiting.has(this)) {
            output.push("*recursive*");
            return;
        }

        visiting.add(this);
        if (this.isList()) {
            output.push("(");
            let item: Value = this;
            while (item instanceof PairValue) {
                item.car.print(output, visiting, options);
                if (item.cdr instanceof PairValue)
                    output.push(" ");
                item = item.cdr;
            }
            output.push(")");
        }
        else {
            output.push("(");
            this.car.print(output, visiting, options);
            output.push(" . ");
            this.cdr.print(output, visiting, options);
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

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
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

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        output.push(JSON.stringify(this.data));
    }
}

export class PortValue extends Value {
    public _class_PortValue: any;

    public constructor() {
        super();
    }

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        output.push("[port]");
    }
}

export class NilValue extends Value {
    public _class_NilValue: any;

    private constructor() {
        super();
    }

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        output.push("nil");
    }

    public static instance = new NilValue();
}

export class UnspecifiedValue extends Value {
    public _class_UnspecifiedValue: any;

    private constructor() {
        super();
    }

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        output.push("*unspecified*");
    }

    public static instance = new UnspecifiedValue();
}

export class ErrorValue extends Value {
    public _class_ErrorValue: any;
    public error: BuildError;

    public constructor(error: BuildError) {
        super();
        this.error = error;
    }

    public printImpl(output: string[], visiting: Set<Value>, options: PrintOptions): void {
        output.push("[error " + JSON.stringify(this.error.detail) + "]");
    }
}
