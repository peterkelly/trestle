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

import { Value, NilValue, NumberValue, StringValue, BooleanValue } from "./value";
import { LexicalSlot, LexicalScope } from "./scope";

export type Continuation = (value: Value) => void;
export type BuiltinProcedure = (args: Value[], succeed: Continuation, fail: Continuation) => void;
export type NumericBuiltin = (args: number[]) => number;
export type NumRelationalBuiltin = (a: number, b: number) => boolean;

export class Variable {
    public _class_Variable: any;
    public slot: LexicalSlot;
    public value: Value;
    public constructor(slot: LexicalSlot, value: Value) {
        this.slot = slot;
        this.value = value;
    }
}

export class Environment {
    public _class_Environment: any;
    public scope: LexicalScope;
    public outer: Environment | null;
    // private entries = new Map<string, Variable>();
    private variables: Variable[];
    public constructor(scope: LexicalScope, outer: Environment | null) {
        this.scope = scope;
        this.outer = outer;
        this.variables = [];
        for (let i = 0; i < scope.slots.length; i++)
            this.variables.push(new Variable(scope.slots[i], NilValue.instance));

        if ((outer !== null) && (scope.outer !== null)) {
            if (outer.scope !== scope.outer) {
                const runtimeNames = outer.scope.slots.map(s => s.name);
                const staticNames = scope.outer.slots.map(s => s.name);
                throw new Error("Environment: mismatch in outer environment/scope;" +
                    " outer.scope " + JSON.stringify(runtimeNames) +
                    ", scope.outer " + JSON.stringify(staticNames));
            }
        }
        else if ((outer === null) && (scope.outer !== null)) {
            throw new Error("Environment: scope has outer but environment doesn't");
        }
        else if ((outer !== null) && (scope.outer === null)) {
            throw new Error("Environment: environment has outer but scope doesn't");
        }
    }

    public getVar(index: number, name: string, slot: LexicalSlot): Variable {
        if ((index < 0) || (index >= this.variables.length))
            throw new Error("getVar " + name + ": invalid index");
        const variable = this.variables[index];
        if (variable.slot.name !== name)
            throw new Error("getVar " + name + ": name mismatch: expected " + name + ", actual " + variable.slot.name);
        if (variable.slot !== slot)
            throw new Error("getVar " + name + ": slot mismatch");
        return variable;
    }

    // public lookup(name: string): Variable | null {
    //     const entry = this.entries.get(name);
    //     if (entry !== undefined)
    //         return entry;
    //     if (this.outer !== null)
    //         return this.outer.lookup(name);
    //     return null;
    // }

    // public define(name: string, value: Value): void {
    //     let entry = this.entries.get(name);
    //     if (entry !== undefined)
    //         throw new Error("Variabe " + JSON.stringify(name) + " is already defined");
    //     entry = new Variable(value);
    //     this.entries.set(name, entry);
    // }

    // public get(name: string): Value {
    //     const entry = this.lookup(name);
    //     if (entry === null)
    //         throw new Error(name + ": no such variable");
    //     return entry.value;
    // }

    // public set(name: string, value: Value): void {
    //     const entry = this.lookup(name);
    //     if (entry === null)
    //         throw new Error(name + ": no such variable");
    //     entry.value = value;
    // }
}

export class BuiltinProcedureValue extends Value {
    public _class_BuiltinProcedureValue: any;
    public name: string;
    public proc: BuiltinProcedure;

    public constructor(name: string, proc: BuiltinProcedure) {
        super();
        this.name = name;
        this.proc = proc;
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("<builtin procedure " + JSON.stringify(this.name) + ">");
    }
}

function toNumbers(args: Value[]): number[] {
    const result: number[] = [];
    for (const arg of args) {
        if (!(arg instanceof NumberValue)) {
            throw new Error("Argument is not a number: " + arg);
        }
        result.push(arg.data);
    }
    return result;
}
// export type NumericBuiltin = (args: number[]) => number;

function num_add(args: number[]): number {
    let result = 0;
    for (const arg of args)
        result += arg;
    return result;
}

function num_subtract(args: number[]): number {
    if (args.length === 0)
        return 0;
    if (args.length === 1)
        return -args[0];

    let total = args[0];
    for (let i = 1; i < args.length; i++)
        total -= args[i];
    return total;
}

function num_multiply(args: number[]): number {
    let result = 1;
    for (const arg of args)
        result *= arg;
    return result;
}

function num_divide(args: number[]): number {
    if (args.length === 0)
        return 0;
    if (args.length === 1)
        return 1 / args[0];

    let total = args[0];
    for (let i = 1; i < args.length; i++)
        total -= args[i];
    return total;
}

function num_mod(args: number[]): number {
    if (args.length !== 2)
        throw new Error("% reuqires exactly two arguments");
    return args[0] % args[1];
}

function wrapNumeric(fun: NumericBuiltin): BuiltinProcedure {
    return (args: Value[], succeed: Continuation, fail: Continuation) => {
        try {
            const numargs = toNumbers(args);
            const result = fun(numargs);
            succeed(new NumberValue(result));
        }
        catch (e) {
            fail(e.message);
        }
    };
}

// export type NumRelationalBuiltin = (a: number, b: number) => boolean;

function num_eq(a: number, b: number): boolean {
    return (a === b);
}

function num_ne(a: number, b: number): boolean {
    return (a !== b);
}

function num_lt(a: number, b: number): boolean {
    return (a < b);
}

function num_le(a: number, b: number): boolean {
    return (a <= b);
}

function num_gt(a: number, b: number): boolean {
    return (a > b);
}

function num_ge(a: number, b: number): boolean {
    return (a >= b);
}

function wrapNumRelational(fun: NumRelationalBuiltin): BuiltinProcedure {
    return (args: Value[], succeed: Continuation, fail: Continuation) => {
        if (args.length !== 2) {
            fail(new StringValue("Exactly two arguments are required"));
            return;
        }
        const a = args[0];
        const b = args[1];
        if (!(a instanceof NumberValue)) {
            fail(new StringValue("First argument must be a number"));
            return;
        }
        if (!(b instanceof NumberValue)) {
            fail(new StringValue("Second argument must be a number"));
            return;
        }
        try {
            const result = fun(a.data, b.data);
            succeed(new BooleanValue(result));
        }
        catch (e) {
            fail(e.message);
        }
    };
}

const builtin_add = wrapNumeric(num_add);
const builtin_subtract = wrapNumeric(num_subtract);
const builtin_multiply = wrapNumeric(num_multiply);
const builtin_divide = wrapNumeric(num_divide);
const builtin_mod = wrapNumeric(num_mod);

const builtin_eq = wrapNumRelational(num_eq);
const builtin_ne = wrapNumRelational(num_ne);
const builtin_lt = wrapNumRelational(num_lt);
const builtin_le = wrapNumRelational(num_le);
const builtin_gt = wrapNumRelational(num_gt);
const builtin_ge = wrapNumRelational(num_ge);

export const builtins: { [name: string]: BuiltinProcedure } = {
    "+": builtin_add,
    "-": builtin_subtract,
    "*": builtin_multiply,
    "/": builtin_divide,
    "%": builtin_mod,
    "==": builtin_eq,
    "!=": builtin_ne,
    "<": builtin_lt,
    "<=": builtin_le,
    ">": builtin_gt,
    ">=": builtin_ge,
};
