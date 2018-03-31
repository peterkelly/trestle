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
import { ASTNode, ApplyNode, LetrecNode, LambdaProcedureValue } from "./ast";
import { evalDirect } from "./eval-direct";
import { BuiltinProcedureValue } from "./builtins";

export function evalCps(node: ASTNode, env: Environment, succeed: Continuation, fail: Continuation): void {
    switch (node.kind) {
        case "constant": {
            succeed(node.value.toValue());
            break;
        }
        case "try": {
            evalCps(node.tryBody, env,
                // success continuation
                (value: Value): void => {
                    succeed(value);
                },
                // failure continuation
                (value: Value): void => {
                    const proc = new LambdaProcedureValue(env, node.catchBody);
                    evalLambdaCps(proc, [value], node.range, succeed, fail);
                });
            break;
        }
        case "throw": {
            // If the throw succeeds (the exception expression was evaluated successfully), then we
            // call fail with the computed value.
            // If the throw fails (another exception occurred while trying to evaluate the expression),
            // then we call fail with that exception. Either way, we fail.
            evalCps(node.body, env, fail, fail);
            break;
        }
        case "assign": {
            const succeed2: Continuation = (value: Value): void => {
                const variable = env.resolveRef(node.ref, node.range);
                variable.value = value;
                succeed(UnspecifiedValue.instance);
            };
            evalCps(node.body, env, succeed2, fail);
            break;
        }
        case "if": {
            const succeed2: Continuation = (value: Value): void => {
                if (value.isTrue())
                    evalCps(node.consequent, env, succeed, fail);
                else
                    evalCps(node.alternative, env, succeed, fail);
            };
            evalCps(node.condition, env, succeed2, fail);
            break;
        }
        case "lambda": {
            succeed(new LambdaProcedureValue(env, node));
            break;
        }
        case "sequence": {
            const succeed2: Continuation = (value: Value): void => {
                evalCps(node.next, env, succeed, fail);
            };
            evalCps(node.body, env, succeed2, fail);
            break;
        }
        case "apply": {
            const succeed2: Continuation = (procValue: Value): void => {
                evalCpsArg(node, procValue, 0, NilValue.instance, env, succeed, fail);
            };
            evalCps(node.proc, env, succeed2, fail);
            break;
        }
        case "variable": {
            try {
                succeed(evalDirect(node, env));
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
            const innerEnv = new Environment(node.innerScope, env);
            evalCpsBinding(node, 0, NilValue.instance, innerEnv, succeed, fail);
            break;
        }
        case "input": {
            throw new BuildError(node.range, "InputNode.evalCps() not implemented");
        }
        default: {
            throw new Error("Unknown node type: " + (<any> node).constructor.name);
        }
    }
}

function evalCpsArg(
    node: ApplyNode, procValue: Value, argno: number, prev: Value, env: Environment,
    succeed: Continuation, fail: Continuation): void {
    if (argno >= node.args.length) {
        evalCpsProc(node, procValue, prev, env, succeed, fail);
        return;
    }

    const succeed2: Continuation = (argValue: Value): void => {
        const lst = new PairValue(argValue, prev);
        evalCpsArg(node, procValue, argno + 1, lst, env, succeed, fail);
    };
    evalCps(node.args[argno], env, succeed2, fail);
}

export function evalCpsProc(
    node: ApplyNode, procValue: Value, argList: Value, env: Environment,
    succeed: Continuation, fail: Continuation): void {
    const argArray = backwardsListToArray(argList);

    if (procValue instanceof BuiltinProcedureValue) {
        procValue.proc(argArray, succeed, fail);
    }
    else if (procValue instanceof LambdaProcedureValue) {
        evalLambdaCps(procValue, argArray, node.range, succeed, fail);
    }
    else {
        const msg = "Cannot apply " + procValue;
        const error = new BuildError(node.range, msg);
        fail(new ErrorValue(error));
        return;
    }
}

export function evalLambdaCps(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange,
    succeed: Continuation, fail: Continuation): void {
    const outerEnv = procValue.env;
    const lambdaNode = procValue.proc;

    const expectedArgCount = lambdaNode.variables.length;
    const actualArgCount = argArray.length;
    if (actualArgCount !== expectedArgCount) {
        const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
        const error = new BuildError(range, msg);
        fail(new ErrorValue(error));
        return;
    }

    const innerEnv = new Environment(lambdaNode.innerScope, outerEnv, argArray);
    evalCps(procValue.proc.body, innerEnv, succeed, fail);
}

function evalCpsBinding(
    node: LetrecNode, bindingIndex: number, prev: Value, innerEnv: Environment,
    succeed: Continuation, fail: Continuation): void {
    if (bindingIndex >= node.bindings.length) {
        evalCpsBody(node, prev, innerEnv, succeed, fail);
        return;
    }

    const succeed2: Continuation = (value: Value): void => {
        const lst = new PairValue(value, prev);
        evalCpsBinding(node, bindingIndex + 1, lst, innerEnv, succeed, fail);
    };
    evalCps(node.bindings[bindingIndex].body, innerEnv, succeed2, fail);
}

function evalCpsBody(
    node: LetrecNode, bindingList: Value, innerEnv: Environment,
    succeed: Continuation, fail: Continuation): void {
    const bindingArray = backwardsListToArray(bindingList);
    innerEnv.setVariableValues(bindingArray);
    evalCps(node.body, innerEnv, succeed, fail);
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
