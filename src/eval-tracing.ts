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
    public readonly children: Trace[] = [];
    private static nextId: number = 0;

    public constructor() {
        this.id = Trace.nextId++;
        this.value = UnspecifiedValue.instance;
    }

    public addChild(trace: Trace): void {
        this.children.push(trace);
    }

    public clear(): void {
        this.children.length = 0;
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
    private readonly variable: Variable;
    private readonly valueTrace: Trace;

    public constructor(syntax: AssignSyntax, env: Environment) {
        super();
        this.variable = env.resolveRef(syntax.ref, syntax.range);
        this.valueTrace = createTrace(syntax.body, env);
    }

    public get name(): string {
        return "assign " + this.variable.slot.name;
    }

    public evaluate(): void {
        this.clear();
        this.valueTrace.evaluate();
        this.addChild(this.valueTrace);
        this.variable.value = this.valueTrace.value;
        this.value = UnspecifiedValue.instance;
    }
}

export class IfTrace extends Trace {
    public readonly _class_IfTrace: any;
    public readonly kind: "if" = "if";
    private readonly syntax: IfSyntax;
    private readonly env: Environment;
    private readonly condTrace: Trace;
    private branchTrace: Trace | null = null;
    private trueBranch: Trace | null = null;
    private falseBranch: Trace | null = null;

    public constructor(syntax: IfSyntax, env: Environment) {
        super();
        this.syntax = syntax;
        this.env = env;
        this.condTrace = createTrace(syntax.condition, env);
    }

    public get name(): string {
        return "if";
    }

    public evaluate(): void {
        this.clear();
        this.addChild(this.condTrace);
        this.condTrace.evaluate();

        if (this.condTrace.value.isTrue()) {
            if (this.trueBranch === null)
                this.trueBranch = createTrace(this.syntax.consequent, this.env);
            this.branchTrace = this.trueBranch;
            this.falseBranch = null;
        }
        else {
            if (this.falseBranch === null)
                this.falseBranch = createTrace(this.syntax.alternative, this.env);
            this.branchTrace = this.falseBranch;
            this.trueBranch = null;
        }

        this.addChild(this.branchTrace);
        this.branchTrace.evaluate();
        this.value = this.branchTrace.value;
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
        this.value = new LambdaProcedureValue(this.env, this.syntax);
    }

    public get name(): string {
        return "lambda";
    }

    public evaluate(): void {
        // Nothing to do here; we already set the value in the constructor
    }
}

export class SequenceTrace extends Trace {
    public readonly _class_SequenceTrace: any;
    public readonly kind: "sequence" = "sequence";
    private readonly bodyTrace: Trace;
    private readonly nextTrace: Trace;

    public constructor(syntax: SequenceSyntax, env: Environment) {
        super();
        this.bodyTrace = createTrace(syntax.body, env);
        this.nextTrace = createTrace(syntax.next, env);
        this.addChild(this.bodyTrace);
        this.addChild(this.nextTrace);
    }

    public get name(): string {
        return "sequence";
    }

    public evaluate(): void {
        this.bodyTrace.evaluate();
        this.nextTrace.evaluate();
        this.value = this.nextTrace.value;
    }
}

export class ApplyTrace extends Trace {
    public readonly _class_ApplyTrace: any;
    public readonly kind: "apply" = "apply";
    private readonly syntax: ApplySyntax;
    private readonly procTrace: Trace;
    private readonly argTraces: Trace[];
    private oldProcValue: Value | null = null;
    private oldCallTrace: Trace | null = null;

    public constructor(syntax: ApplySyntax, env: Environment) {
        super();
        this.syntax = syntax;
        this.procTrace = createTrace(syntax.proc, env);
        this.argTraces = [];
        for (let i = 0; i < syntax.args.length; i++) {
            const arg = syntax.args[i];
            const argTrace = createTrace(arg, env);
            this.argTraces.push(argTrace);
        }
    }

    public get name(): string {
        return "apply";
    }

    public evaluate(): void {
        this.clear();
        this.addChild(this.procTrace);
        for (const argTrace of this.argTraces)
            this.addChild(argTrace);

        this.procTrace.evaluate();
        const procValue = this.procTrace.value;
        for (const argTrace of this.argTraces)
            argTrace.evaluate();
        const argValues = this.argTraces.map(trace => trace.value);

        let callTrace: Trace | null = null;
        if (procValue instanceof BuiltinProcedureValue) {
            this.value = procValue.direct(argValues);
        }
        else if (procValue instanceof LambdaProcedureValue) {
            const innerEnv = new Environment(procValue.proc.innerScope, procValue.env, argValues);
            if ((this.oldProcValue === procValue) && (this.oldCallTrace !== null))
                callTrace = this.oldCallTrace;
            else
                callTrace = createTrace(procValue.proc.body, innerEnv);
            this.addChild(callTrace);
            callTrace.evaluate();
            this.value = callTrace.value;
        }
        else {
            const msg = "Cannot apply " + procValue;
            const error = new BuildError(this.syntax.range, msg);
            throw new SchemeException(new ErrorValue(error));
        }

        this.oldProcValue = procValue;
        this.oldCallTrace = callTrace;
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
    private readonly innerEnv: Environment;
    private readonly bindings: Trace[];
    private readonly body: Trace;

    public constructor(syntax: LetrecSyntax, env: Environment) {
        super();
        this.innerEnv = new Environment(syntax.innerScope, env);
        this.bindings = [];
        for (let i = 0; i < syntax.bindings.length; i++) {
            const binding = syntax.bindings[i];
            const bindingTrace = createTrace(binding.body, this.innerEnv);
            this.bindings.push(bindingTrace);
        }
        this.body = createTrace(syntax.body, this.innerEnv);

        for (const binding of this.bindings)
            this.addChild(binding);
        this.addChild(this.body);
    }

    public get name(): string {
        return "letrec";
    }

    public evaluate(): void {
        for (const binding of this.bindings)
            binding.evaluate();
        const bindingArray = this.bindings.map(trace => trace.value);
        this.innerEnv.setVariableValues(bindingArray);
        this.body.evaluate();
        this.value = this.body.value;
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
        return "input[" + JSON.stringify(this.syntax.name) + "]";
    }

    public evaluate(): void {
        const dfnode = getInput(this.syntax.name);
        this.value = dfnode.value;
    }
}


export function createTrace(syntax: Syntax, env: Environment): Trace {
    switch (syntax.kind) {
        case "constant":
            return new ConstantTrace(syntax);
        case "try":
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        case "throw":
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        case "assign":
            return new AssignTrace(syntax, env);
        case "if":
            return new IfTrace(syntax, env);
        case "lambda":
            return new LambdaTrace(syntax, env);
        case "sequence":
            return new SequenceTrace(syntax, env);
        case "apply":
            return new ApplyTrace(syntax, env);
        case "variable":
            return new VariableTrace(syntax, env);
        case "letrec":
            return new LetrecTrace(syntax, env);
        case "input":
            return new InputTrace(syntax);
    }
}
