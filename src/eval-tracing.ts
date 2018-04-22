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
    Syntax,
    ConstantSyntax,
    AssignSyntax,
    IfSyntax,
    LambdaSyntax,
    SequenceSyntax,
    ApplySyntax,
    VariableSyntax,
    LetrecSyntax,
    InputSyntax,
    LambdaProcedureValue,
} from "./ast";
import { BuildError } from "./sexpr";
import { Value, ErrorValue, UnspecifiedValue } from "./value";
import { Variable, Environment, SchemeException } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";
import { getInput } from "./dataflow";

export abstract class Trace {
    public readonly _class_Trace: any;
    public readonly id: number;
    public value: Value;
    public children: Trace[] = [];
    private static nextId: number = 0;

    public constructor() {
        this.id = Trace.nextId++;
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

    public abstract readonly name: string;

    public abstract evaluate(): void;
}

export class ConstantTrace extends Trace {
    public readonly _class_ConstantTrace: any;
    public readonly kind: "constant" = "constant";
    private readonly syntax: ConstantSyntax;

    public constructor(syntax: ConstantSyntax) {
        super();
        this.syntax = syntax;
    }

    public get name(): string {
        return "constant " + this.value;
    }

    public evaluate(): void {
        this.value = this.syntax.value.toValue();
    }
}

export class AssignTrace extends Trace {
    public readonly _class_AssignTrace: any;
    public readonly kind: "assign" = "assign";
    private readonly syntax: AssignSyntax;
    private readonly env: Environment;
    private readonly variable: Variable;

    public constructor(syntax: AssignSyntax, env: Environment) {
        super();
        this.syntax = syntax;
        this.env = env;
        this.variable = env.resolveRef(syntax.ref, syntax.range);
    }

    public get name(): string {
        return "assign " + this.variable.slot.name;
    }

    public evaluate(): void {
        const valueTrace = evalTracing(this.syntax.body, this.env);
        this.addChild(valueTrace);
        this.variable.value = valueTrace.value;
        this.value = UnspecifiedValue.instance;
    }
}

export class IfTrace extends Trace {
    public readonly _class_IfTrace: any;
    public readonly kind: "if" = "if";
    private readonly syntax: IfSyntax;
    private readonly env: Environment;

    public constructor(syntax: IfSyntax, env: Environment) {
        super();
        this.syntax = syntax;
        this.env = env;
    }

    public get name(): string {
        return "if";
    }

    public evaluate(): void {
        const condTrace = evalTracing(this.syntax.condition, this.env);
        this.addChild(condTrace);
        let branchTrace: Trace;
        if (condTrace.value.isTrue())
            branchTrace = evalTracing(this.syntax.consequent, this.env);
        else
            branchTrace = evalTracing(this.syntax.alternative, this.env);
        this.addChild(branchTrace);
        this.value = branchTrace.value;
    }
}

export class LambdaTrace extends Trace {
    public readonly _class_LambdaTrace: any;
    public readonly kind: "lambda" = "lambda";
    private readonly syntax: LambdaSyntax;
    private readonly env: Environment;

    public constructor(syntax: LambdaSyntax, env: Environment) {
        super();
        this.syntax = syntax;
        this.env = env;
    }

    public get name(): string {
        return "lambda";
    }

    public evaluate(): void {
        this.value = new LambdaProcedureValue(this.env, this.syntax);
    }
}

export class SequenceTrace extends Trace {
    public readonly _class_SequenceTrace: any;
    public readonly kind: "sequence" = "sequence";
    private readonly syntax: SequenceSyntax;
    private readonly env: Environment;

    public constructor(syntax: SequenceSyntax, env: Environment) {
        super();
        this.syntax = syntax;
        this.env = env;
    }

    public get name(): string {
        return "sequence";
    }

    public evaluate(): void {
        const bodyTrace = evalTracing(this.syntax.body, this.env);
        this.addChild(bodyTrace);
        const nextTrace = evalTracing(this.syntax.next, this.env);
        this.addChild(nextTrace);
        this.value = nextTrace.value;
    }
}

export class ApplyTrace extends Trace {
    public readonly _class_ApplyTrace: any;
    public readonly kind: "apply" = "apply";
    private readonly syntax: ApplySyntax;
    private readonly env: Environment;

    public constructor(syntax: ApplySyntax, env: Environment) {
        super();
        this.syntax = syntax;
        this.env = env;
    }

    public get name(): string {
        return "apply";
    }

    public evaluate(): void {
        const procTrace = evalTracing(this.syntax.proc, this.env);
        this.addChild(procTrace);
        const procValue = procTrace.value;
        const argTraces: Trace[] = [];
        for (let i = 0; i < this.syntax.args.length; i++) {
            const arg = this.syntax.args[i];
            const argTrace = evalTracing(arg, this.env);
            this.addChild(argTrace);
            argTraces.push(argTrace);
        }
        const argValues = argTraces.map(trace => trace.value);

        if (procValue instanceof BuiltinProcedureValue) {
            this.value = procValue.direct(argValues);
        }
        else if (procValue instanceof LambdaProcedureValue) {
            const innerEnv = new Environment(procValue.proc.innerScope, procValue.env, argValues);
            const callTrace = evalTracing(procValue.proc.body, innerEnv);
            this.addChild(callTrace);
            this.value = callTrace.value;
        }
        else {
            const msg = "Cannot apply " + procValue;
            const error = new BuildError(this.syntax.range, msg);
            throw new SchemeException(new ErrorValue(error));
        }
    }
}

export class VariableTrace extends Trace {
    public readonly _class_VariableTrace: any;
    public readonly kind: "variable" = "variable";
    private readonly variable: Variable;

    public constructor(syntax: VariableSyntax, env: Environment) {
        super();
        this.variable = env.resolveRef(syntax.ref, syntax.range);
    }

    public get name(): string {
        return "variable " + this.variable.slot.name;
    }

    public evaluate(): void {
        this.value = this.variable.value;
    }
}

export class LetrecTrace extends Trace {
    public readonly _class_LetrecTrace: any;
    public readonly kind: "letrec" = "letrec";
    private readonly syntax: LetrecSyntax;
    private readonly env: Environment;

    public constructor(syntax: LetrecSyntax, env: Environment) {
        super();
        this.syntax = syntax;
        this.env = env;
    }

    public get name(): string {
        return "letrec";
    }

    public evaluate(): void {
        const innerEnv = new Environment(this.syntax.innerScope, this.env);
        const bindingTraceArray: Trace[] = [];
        for (const binding of this.syntax.bindings) {
            const bindingTrace = evalTracing(binding.body, innerEnv);
            this.addChild(bindingTrace);
            bindingTraceArray.push(bindingTrace);
        }
        const bindingArray = bindingTraceArray.map(trace => trace.value);
        innerEnv.setVariableValues(bindingArray);
        const bodyTrace = evalTracing(this.syntax.body, innerEnv);
        this.addChild(bodyTrace);
        this.value = bodyTrace.value;
    }
}

export class InputTrace extends Trace {
    public readonly _class_InputTrace: any;
    public readonly kind: "input" = "input";
    private readonly syntax: InputSyntax;

    public constructor(syntax: InputSyntax) {
        super();
        this.syntax = syntax;
    }

    public get name(): string {
        return "input";
    }

    public evaluate(): void {
        const dfnode = getInput(this.syntax.name);
        this.value = dfnode.value;
    }
}


export function evalTracing(syntax: Syntax, env: Environment): Trace {
    switch (syntax.kind) {
        case "constant": {
            const result = new ConstantTrace(syntax);
            result.evaluate();
            return result;
        }
        case "try":
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        case "throw":
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        case "assign": {
            const result = new AssignTrace(syntax, env);
            result.evaluate();
            return result;
        }
        case "if": {
            const result = new IfTrace(syntax, env);
            result.evaluate();
            return result;
        }
        case "lambda": {
            const result = new LambdaTrace(syntax, env);
            result.evaluate();
            return result;
        }
        case "sequence": {
            const result = new SequenceTrace(syntax, env);
            result.evaluate();
            return result;
        }
        case "apply": {
            const result = new ApplyTrace(syntax, env);
            result.evaluate();
            return result;
        }
        case "variable": {
            const result = new VariableTrace(syntax, env);
            result.evaluate();
            return result;
        }
        case "letrec": {
            const result = new LetrecTrace(syntax, env);
            result.evaluate();
            return result;
        }
        case "input": {
            const result = new InputTrace(syntax);
            result.evaluate();
            return result;
        }
    }
}
