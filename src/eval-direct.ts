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

import { ASTNode, LambdaProcedureValue } from "./ast";
import { BuildError } from "./sexpr";
import { SourceRange } from "./source";
import { Value, ErrorValue, UnspecifiedValue } from "./value";
import { Environment, SchemeException } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";

let evalDirectEnabled = true;

// This function is called when running in reactive evaluation mode. It's a sanity check to
// ensure the interpreter doesn't "leak" into direct evaluation style.
export function disableEvalDirect(): void {
    evalDirectEnabled = false;
}

function checkEvalDirectEnabled(node: ASTNode): void {
    if (!evalDirectEnabled)
        throw new Error("Attempt to call evalDirect with " + node.kind + " node");
}

export function evalDirect(node: ASTNode, env: Environment): Value {
    checkEvalDirectEnabled(node);
    switch (node.kind) {
        case "constant": {
            return node.value.toValue();
        }
        case "try": {
            try {
                return evalDirect(node.tryBody, env);
            }
            catch (e) {
                if (e instanceof SchemeException) {
                    const value = e.value;
                    const proc = new LambdaProcedureValue(env, node.catchBody);
                    return evalLambdaDirect(proc, [value], node.range);
                }
                else {
                    throw e;
                }
            }
        }
        case "throw": {
            const value = evalDirect(node.body, env);
            throw new SchemeException(value);
        }
        case "assign": {
            const value = evalDirect(node.body, env);
            const variable = env.resolveRef(node.ref, node.range);
            variable.value = value;
            return UnspecifiedValue.instance;
        }
        case "if": {
            const condValue = evalDirect(node.condition, env);
            if (condValue.isTrue())
                return evalDirect(node.consequent, env);
            else
                return evalDirect(node.alternative, env);
        }
        case "lambda": {
            return new LambdaProcedureValue(env, node);
        }
        case "sequence": {
            evalDirect(node.body, env);
            return evalDirect(node.next, env);
        }
        case "apply": {
            const procValue: Value = evalDirect(node.proc, env);
            const argArray: Value[] = [];
            for (let i = 0; i < node.args.length; i++) {
                const arg = node.args[i];
                argArray.push(evalDirect(arg, env));
            }

            if (procValue instanceof BuiltinProcedureValue) {
                return procValue.direct(argArray);
            }
            else if (procValue instanceof LambdaProcedureValue) {
                return evalLambdaDirect(procValue, argArray, node.range);
            }
            else {
                const msg = "Cannot apply " + procValue;
                const error = new BuildError(node.range, msg);
                throw new SchemeException(new ErrorValue(error));
            }
        }
        case "variable": {
            const variable = env.resolveRef(node.ref, node.range);
            return variable.value;
        }
        case "letrec": {
            const innerEnv = new Environment(node.innerScope, env);
            const bindingArray: Value[] = [];
            for (const binding of node.bindings)
                bindingArray.push(evalDirect(binding.body, innerEnv));
            innerEnv.setVariableValues(bindingArray);
            return evalDirect(node.body, innerEnv);
        }
        case "input": {
            throw new BuildError(node.range, "InputNode.evalDirect() not implemented");
        }
    }
}

export function evalLambdaDirect(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange): Value {
    const outerEnv = procValue.env;
    const lambdaNode = procValue.proc;

    const expectedArgCount = lambdaNode.variables.length;
    const actualArgCount = argArray.length;
    if (actualArgCount !== expectedArgCount) {
        const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
        const error = new BuildError(range, msg);
        throw new SchemeException(new ErrorValue(error));
    }

    const innerEnv = new Environment(lambdaNode.innerScope, outerEnv, argArray);
    return evalDirect(procValue.proc.body, innerEnv);
}
