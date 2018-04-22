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

import { Syntax, LambdaProcedureValue } from "./ast";
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

function checkEvalDirectEnabled(syntax: Syntax): void {
    if (!evalDirectEnabled)
        throw new Error("Attempt to call evalDirect with " + syntax.kind + " syntax");
}

export function evalDirect(syntax: Syntax, env: Environment): Value {
    checkEvalDirectEnabled(syntax);
    switch (syntax.kind) {
        case "constant": {
            return syntax.value.toValue();
        }
        case "try": {
            try {
                return evalDirect(syntax.tryBody, env);
            }
            catch (e) {
                if (e instanceof SchemeException) {
                    const value = e.value;
                    const proc = new LambdaProcedureValue(env, syntax.catchBody);
                    return evalLambdaDirect(proc, [value], syntax.range);
                }
                else {
                    throw e;
                }
            }
        }
        case "throw": {
            const value = evalDirect(syntax.body, env);
            throw new SchemeException(value);
        }
        case "assign": {
            const value = evalDirect(syntax.body, env);
            const variable = env.resolveRef(syntax.ref, syntax.range);
            variable.value = value;
            return UnspecifiedValue.instance;
        }
        case "if": {
            const condValue = evalDirect(syntax.condition, env);
            if (condValue.isTrue())
                return evalDirect(syntax.consequent, env);
            else
                return evalDirect(syntax.alternative, env);
        }
        case "lambda": {
            return new LambdaProcedureValue(env, syntax);
        }
        case "sequence": {
            evalDirect(syntax.body, env);
            return evalDirect(syntax.next, env);
        }
        case "apply": {
            const procValue: Value = evalDirect(syntax.proc, env);
            const argArray: Value[] = [];
            for (let i = 0; i < syntax.args.length; i++) {
                const arg = syntax.args[i];
                argArray.push(evalDirect(arg, env));
            }

            if (procValue instanceof BuiltinProcedureValue) {
                return procValue.direct(argArray);
            }
            else if (procValue instanceof LambdaProcedureValue) {
                return evalLambdaDirect(procValue, argArray, syntax.range);
            }
            else {
                const msg = "Cannot apply " + procValue;
                const error = new BuildError(syntax.range, msg);
                throw new SchemeException(new ErrorValue(error));
            }
        }
        case "variable": {
            const variable = env.resolveRef(syntax.ref, syntax.range);
            return variable.value;
        }
        case "letrec": {
            const innerEnv = new Environment(syntax.innerScope, env);
            const bindingArray: Value[] = [];
            for (const binding of syntax.bindings)
                bindingArray.push(evalDirect(binding.body, innerEnv));
            innerEnv.setVariableValues(bindingArray);
            return evalDirect(syntax.body, innerEnv);
        }
        case "input": {
            throw new BuildError(syntax.range, "InputSyntax.evalDirect() not implemented");
        }
    }
}

export function evalLambdaDirect(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange): Value {
    const outerEnv = procValue.env;
    const lambdaSyntax = procValue.proc;

    const expectedArgCount = lambdaSyntax.variables.length;
    const actualArgCount = argArray.length;
    if (actualArgCount !== expectedArgCount) {
        const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
        const error = new BuildError(range, msg);
        throw new SchemeException(new ErrorValue(error));
    }

    const innerEnv = new Environment(lambdaSyntax.innerScope, outerEnv, argArray);
    return evalDirect(procValue.proc.body, innerEnv);
}
