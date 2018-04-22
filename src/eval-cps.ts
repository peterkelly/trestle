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

import { SourceRange } from "./source";
import { BuildError } from "./sexpr";
import { Value, PairValue, NilValue, ErrorValue, UnspecifiedValue } from "./value";
import { Environment, Continuation, SchemeException } from "./runtime";
import { Syntax, ApplySyntax, LetrecSyntax, LambdaProcedureValue } from "./ast";
import { evalDirect } from "./eval-direct";
import { BuiltinProcedureValue } from "./builtins";

export function evalCps(syntax: Syntax, env: Environment, succeed: Continuation, fail: Continuation): void {
    switch (syntax.kind) {
        case "constant": {
            succeed(syntax.value.toValue());
            break;
        }
        case "try": {
            evalCps(syntax.tryBody, env,
                // success continuation
                (value: Value): void => {
                    succeed(value);
                },
                // failure continuation
                (value: Value): void => {
                    const proc = new LambdaProcedureValue(env, syntax.catchBody);
                    evalLambdaCps(proc, [value], syntax.range, succeed, fail);
                });
            break;
        }
        case "throw": {
            // If the throw succeeds (the exception expression was evaluated successfully), then we
            // call fail with the computed value.
            // If the throw fails (another exception occurred while trying to evaluate the expression),
            // then we call fail with that exception. Either way, we fail.
            evalCps(syntax.body, env, fail, fail);
            break;
        }
        case "assign": {
            const succeed2: Continuation = (value: Value): void => {
                const variable = env.resolveRef(syntax.ref, syntax.range);
                variable.value = value;
                succeed(UnspecifiedValue.instance);
            };
            evalCps(syntax.body, env, succeed2, fail);
            break;
        }
        case "if": {
            const succeed2: Continuation = (value: Value): void => {
                if (value.isTrue())
                    evalCps(syntax.consequent, env, succeed, fail);
                else
                    evalCps(syntax.alternative, env, succeed, fail);
            };
            evalCps(syntax.condition, env, succeed2, fail);
            break;
        }
        case "lambda": {
            succeed(new LambdaProcedureValue(env, syntax));
            break;
        }
        case "sequence": {
            const succeed2: Continuation = (value: Value): void => {
                evalCps(syntax.next, env, succeed, fail);
            };
            evalCps(syntax.body, env, succeed2, fail);
            break;
        }
        case "apply": {
            const succeed2: Continuation = (procValue: Value): void => {
                evalCpsArg(syntax, procValue, 0, NilValue.instance, env, succeed, fail);
            };
            evalCps(syntax.proc, env, succeed2, fail);
            break;
        }
        case "variable": {
            try {
                succeed(evalDirect(syntax, env));
            }
            catch (e) {
                if (e instanceof SchemeException)
                    fail(e.value);
                else
                    throw e;
            }
            break;
        }
        case "letrec": {
            const innerEnv = new Environment(syntax.innerScope, env);
            evalCpsBinding(syntax, 0, NilValue.instance, innerEnv, succeed, fail);
            break;
        }
        case "input": {
            throw new BuildError(syntax.range, "InputSyntax.evalCps() not implemented");
        }
        default: {
            throw new Error("Unknown syntax type: " + (<any> syntax).constructor.name);
        }
    }
}

function evalCpsArg(
    syntax: ApplySyntax, procValue: Value, argno: number, prev: Value, env: Environment,
    succeed: Continuation, fail: Continuation): void {
    if (argno >= syntax.args.length) {
        evalCpsProc(syntax, procValue, prev, env, succeed, fail);
        return;
    }

    const succeed2: Continuation = (argValue: Value): void => {
        const lst = new PairValue(argValue, prev);
        evalCpsArg(syntax, procValue, argno + 1, lst, env, succeed, fail);
    };
    evalCps(syntax.args[argno], env, succeed2, fail);
}

export function evalCpsProc(
    syntax: ApplySyntax, procValue: Value, argList: Value, env: Environment,
    succeed: Continuation, fail: Continuation): void {
    const argArray = backwardsListToArray(argList);

    if (procValue instanceof BuiltinProcedureValue) {
        procValue.proc(argArray, succeed, fail);
    }
    else if (procValue instanceof LambdaProcedureValue) {
        evalLambdaCps(procValue, argArray, syntax.range, succeed, fail);
    }
    else {
        const msg = "Cannot apply " + procValue;
        const error = new BuildError(syntax.range, msg);
        fail(new ErrorValue(error));
        return;
    }
}

export function evalLambdaCps(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange,
    succeed: Continuation, fail: Continuation): void {
    const outerEnv = procValue.env;
    const lambdaSyntax = procValue.proc;

    const expectedArgCount = lambdaSyntax.variables.length;
    const actualArgCount = argArray.length;
    if (actualArgCount !== expectedArgCount) {
        const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
        const error = new BuildError(range, msg);
        fail(new ErrorValue(error));
        return;
    }

    const innerEnv = new Environment(lambdaSyntax.innerScope, outerEnv, argArray);
    evalCps(procValue.proc.body, innerEnv, succeed, fail);
}

function evalCpsBinding(
    syntax: LetrecSyntax, bindingIndex: number, prev: Value, innerEnv: Environment,
    succeed: Continuation, fail: Continuation): void {
    if (bindingIndex >= syntax.bindings.length) {
        evalCpsBody(syntax, prev, innerEnv, succeed, fail);
        return;
    }

    const succeed2: Continuation = (value: Value): void => {
        const lst = new PairValue(value, prev);
        evalCpsBinding(syntax, bindingIndex + 1, lst, innerEnv, succeed, fail);
    };
    evalCps(syntax.bindings[bindingIndex].body, innerEnv, succeed2, fail);
}

function evalCpsBody(
    syntax: LetrecSyntax, bindingList: Value, innerEnv: Environment,
    succeed: Continuation, fail: Continuation): void {
    const bindingArray = backwardsListToArray(bindingList);
    innerEnv.setVariableValues(bindingArray);
    evalCps(syntax.body, innerEnv, succeed, fail);
}

function backwardsListToArray(list: Value): Value[] {
    const array: Value[] = [];
    while ((list instanceof PairValue)) {
        array.push(list.car);
        list = list.cdr;
    }
    if (!(list instanceof NilValue))
        throw new Error("list should be terminated by nil");
    array.reverse();
    return array;
}
