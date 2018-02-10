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
    Value,
    NumberValue,
    StringValue,
    SymbolValue,
    BooleanValue,
    PairValue,
    NilValue,
    UnspecifiedValue,
} from "./value";
import { Continuation } from "./runtime";

export type BuiltinProcedure = (args: Value[], succeed: Continuation, fail: Continuation) => void;
export type NumericBuiltin = (args: number[]) => number;
export type NumRelationalBuiltin = (a: number, b: number) => boolean;

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

function builtin_display(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1) {
        fail(new StringValue("display requires exactly one argument"));
        return;
    }
    const value = args[0];
    if (value instanceof StringValue)
        process.stdout.write(value.data);
    else
        process.stdout.write(value.toString());
    succeed(UnspecifiedValue.instance);
}

function builtin_newline(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 0) {
        fail(new StringValue("newline does not accept any arguments"));
        return;
    }
    process.stdout.write("\n");
    succeed(UnspecifiedValue.instance);
}

function builtin_cons(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 2) {
        fail(new StringValue("const requires exactly two arguments"));
        return;
    }
    const pair = new PairValue(args[0], args[1]);
    succeed(pair);
}

function builtin_car(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1) {
        fail(new StringValue("car requires exactly one argument"));
        return;
    }
    const pair = args[0];
    if (!(pair instanceof PairValue)) {
        fail(new StringValue("car requires its argument to be a pair"));
        return;
    }
    succeed(pair.car);
}

function builtin_cdr(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1) {
        fail(new StringValue("cdr requires exactly one argument"));
        return;
    }
    const pair = args[0];
    if (!(pair instanceof PairValue)) {
        fail(new StringValue("cdr requires its argument to be a pair"));
        return;
    }
    succeed(pair.cdr);
}

function builtin_boolean_q(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1)
        fail(new StringValue("boolean? requires exactly one argument"));
    else
        succeed(new BooleanValue(args[0] instanceof BooleanValue));
}

function builtin_symbol_q(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1)
        fail(new StringValue("symbol? requires exactly one argument"));
    else
        succeed(new BooleanValue(args[0] instanceof SymbolValue));
}

function builtin_pair_q(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1)
        fail(new StringValue("pair? requires exactly one argument"));
    else
        succeed(new BooleanValue(args[0] instanceof PairValue));
}

function builtin_number_q(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1)
        fail(new StringValue("number? requires exactly one argument"));
    else
        succeed(new BooleanValue(args[0] instanceof NumberValue));
}

function builtin_string_q(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1)
        fail(new StringValue("string? requires exactly one argument"));
    else
        succeed(new BooleanValue(args[0] instanceof StringValue));
}

function builtin_null_q(args: Value[], succeed: Continuation, fail: Continuation): void {
    if (args.length !== 1)
        fail(new StringValue("null? requires exactly one argument"));
    else
        succeed(new BooleanValue(args[0] instanceof NilValue));
}

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
    "display": builtin_display,
    "newline": builtin_newline,
    "cons": builtin_cons,
    "car": builtin_car,
    "cdr": builtin_cdr,
    "boolean?": builtin_boolean_q,
    "symbol?": builtin_symbol_q,
    "pair?": builtin_pair_q,
    "number?": builtin_number_q,
    "string?": builtin_string_q,
    "null?": builtin_null_q,
};
