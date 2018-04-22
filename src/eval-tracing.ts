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
import { Value, ErrorValue, UnspecifiedValue } from "./value";
import { Environment, SchemeException } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";
import { getInput } from "./dataflow";

export class Trace {
    public readonly _class_Trace: any;
    public name: string;
    public readonly id: number;
    public value: Value;
    public children: Trace[] = [];
    private static nextId: number = 0;

    public constructor(name: string) {
        this.id = Trace.nextId++;
        this.name = name;
        this.value = UnspecifiedValue.instance;
    }

    public addChild(trace: Trace): void {
        this.children.push(trace);
    }

    public print(lines: string[], prefix: string, indent: string): void {
        lines.push(prefix + "#" + this.id + " " + this.name);
        for (let i = 0; i < this.children.length; i++) {
            if (i + 1 < this.children.length)
                this.children[i].print(lines, indent + "├── ", indent + "│   ");
            else
                this.children[i].print(lines, indent + "└── ", indent + "    ");
        }
    }
}

export function evalTracing(syntax: Syntax, env: Environment): Trace {
    const result = new Trace(syntax.kind);
    switch (syntax.kind) {
        case "constant": {
            result.value = syntax.value.toValue();
            result.name = "constant " + result.value;
            break;
        }
        case "try":
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        case "throw":
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        case "assign": {
            const valueTrace = evalTracing(syntax.body, env);
            result.addChild(valueTrace);
            const variable = env.resolveRef(syntax.ref, syntax.range);
            variable.value = valueTrace.value;
            result.value = UnspecifiedValue.instance;
            result.name = "assign " + variable.slot.name;
            break;
        }
        case "if": {
            const condTrace = evalTracing(syntax.condition, env);
            result.addChild(condTrace);
            let branchTrace: Trace;
            if (condTrace.value.isTrue())
                branchTrace = evalTracing(syntax.consequent, env);
            else
                branchTrace = evalTracing(syntax.alternative, env);
            result.addChild(branchTrace);
            result.value = branchTrace.value;
            break;
        }
        case "lambda": {
            result.value = new LambdaProcedureValue(env, syntax);
            break;
        }
        case "sequence": {
            const bodyTrace = evalTracing(syntax.body, env);
            result.addChild(bodyTrace);
            const nextTrace = evalTracing(syntax.next, env);
            result.addChild(nextTrace);
            result.value = nextTrace.value;
            break;
        }
        case "apply": {
            const procTrace = evalTracing(syntax.proc, env);
            result.addChild(procTrace);
            const procValue = procTrace.value;
            const argTraces: Trace[] = [];
            for (let i = 0; i < syntax.args.length; i++) {
                const arg = syntax.args[i];
                const argTrace = evalTracing(arg, env);
                result.addChild(argTrace);
                argTraces.push(argTrace);
            }
            const argValues = argTraces.map(trace => trace.value);

            if (procValue instanceof BuiltinProcedureValue) {
                result.value = procValue.direct(argValues);
            }
            else if (procValue instanceof LambdaProcedureValue) {
                const innerEnv = new Environment(procValue.proc.innerScope, procValue.env, argValues);
                const callTrace = evalTracing(procValue.proc.body, innerEnv);
                result.addChild(callTrace);
                result.value = callTrace.value;
            }
            else {
                const msg = "Cannot apply " + procValue;
                const error = new BuildError(syntax.range, msg);
                throw new SchemeException(new ErrorValue(error));
            }
            break;
        }
        case "variable": {
            const variable = env.resolveRef(syntax.ref, syntax.range);
            result.value = variable.value;
            result.name = "variable " + variable.slot.name;
            break;
        }
        case "letrec": {
            const innerEnv = new Environment(syntax.innerScope, env);
            const bindingTraceArray: Trace[] = [];
            for (const binding of syntax.bindings) {
                const bindingTrace = evalTracing(binding.body, innerEnv);
                result.addChild(bindingTrace);
                bindingTraceArray.push(bindingTrace);
            }
            const bindingArray = bindingTraceArray.map(trace => trace.value);
            innerEnv.setVariableValues(bindingArray);
            const bodyTrace = evalTracing(syntax.body, innerEnv);
            result.addChild(bodyTrace);
            result.value = bodyTrace.value;
            break;
        }
        case "input": {
            const dfnode = getInput(syntax.name);
            result.value = dfnode.value;
            break;
        }
    }
    return result;
}
