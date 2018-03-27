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
import { BuiltinProcedureValue } from "./builtins";
import {
    Environment,
    SchemeException,
} from "./runtime";
import {
    Value,
    UnspecifiedValue,
    ErrorValue,
} from "./value";
import {
    ConstantNode,
    AssignNode,
    IfNode,
    LambdaProcedureValue,
    LambdaNode,
    SequenceNode,
    ApplyNode,
    VariableNode,
    LetrecNode,
    bindLambdaArguments,
    bindLetrecValues,
} from "./ast";

const allInputs = new Map<string, InputDataflowNode>();
let dirtyNodes: DataflowNode[] = [];

export function reevaluateDataflowGraph(): void {
    while (true) {
        const nodes = dirtyNodes;
        dirtyNodes = [];
        if (nodes.length === 0)
            break;
        for (const node of nodes) {
            node.dirty = false;
            node.reevaluate();
        }
    }
}

export function createInput(name: string, initialValue: Value): void {
    const existing = allInputs.get(name);
    if (existing !== undefined)
        throw new Error("Input " + JSON.stringify(name) + " already exits");
    const node = new InputDataflowNode(initialValue);
    allInputs.set(name, node);
}

export function getInput(name: string): InputDataflowNode {
    const input = allInputs.get(name);
    if (input === undefined)
        throw new Error("Input " + JSON.stringify(name) + " does not exist");
    return input;
}

export function updateInput(name: string, value: Value): void {
    const input = allInputs.get(name);
    if (input === undefined)
        throw new Error("Input " + JSON.stringify(name) + " does not exist");
    input.updateValue(value);
}

export abstract class DataflowNode {
    private static nextId = 0;
    private id: number;
    public value: Value = UnspecifiedValue.instance;
    private inputs: DataflowNode[] = [];
    private outputs: DataflowNode[] = [];
    public dirty: boolean = false;

    public constructor() {
        this.id = DataflowNode.nextId++;
    }

    public addOutput(output: DataflowNode): void {
        const outputIndex = this.outputs.indexOf(output);
        if (outputIndex >= 0)
            throw new Error("addOutput: output is already present");
        this.outputs.push(output);

        const inputIndex = output.inputs.indexOf(this);
        if (inputIndex >= 0)
            throw new Error("addOutput: input is already present");
        output.inputs.push(this);
    }

    public removeOutput(output: DataflowNode): void {
        const outputIndex = this.outputs.indexOf(output);
        if (outputIndex < 0)
            throw new Error("removeOutput: output is not present in list");
        this.outputs.splice(outputIndex, 1);

        const inputIndex = output.inputs.indexOf(this);
        if (inputIndex < 0)
            throw new Error("removeOutput: input is not present in list");
        output.inputs.splice(inputIndex, 1);
    }

    public markDirty(): void {
        if (!this.dirty) {
            this.dirty = true;
            dirtyNodes.push(this);
        }
    }

    protected markOutputsAsDirty(): void {
        for (const output of this.outputs)
            output.markDirty();
    }

    public updateValue(newValue: Value): void {
        if (this.value !== newValue) {
            this.trace("value changed: " + this.value + " -> " + newValue);
            this.value = newValue;
            this.markOutputsAsDirty();
        }
        // else {
        //     this.trace("value unchanged: " + this.value);
        // }
    }

    public toString(): string {
        const fullName = "" + (<any> this).constructor.name;
        const name = fullName.replace(/DataflowNode$/, "");
        return name + "[" + this.id + "]";
    }

    protected trace(msg: string): void {
        console.log(this + " " + msg);
    }

    public dump(indent: string): void {
        console.log(indent + this + " = " + this.value);
        for (const input of this.inputs)
            input.dump(indent + "  i ");
    }

    // Called when the change propagation logic has determined that one or more inputs to this
    // node have changed their value. The node should re-execute whatever operations it originally
    // performed to obtain its own value, but retaining existing dataflow nodes where appropriate.
    public abstract reevaluate(): void;

    // Called when the node is no longer, and will never again be part of the dataflow graph. The
    // purpose of this method is to ensure that there are no outstanding references to it, so that
    // it may be garbage collected.
    public abstract detach(): void;
}

export class EnvSlotDataflowNode extends DataflowNode {
    public constructor() {
        super();
    }

    public reevaluate(): void {
        // Nothing to do here
    }

    public detach(): void {
        // Nothing to do here
    }
}

export class ConstantDataflowNode extends DataflowNode {
    public constructor(public ast: ConstantNode, public env: Environment) {
        super();

        this.value = this.ast.value.toValue();
    }

    public reevaluate(): void {
        // Nothing to do here
    }

    public detach(): void {
        // Nothing to do here
    }
}

export class AssignDataflowNode extends DataflowNode {
    public constructor(public ast: AssignNode, public env: Environment) {
        super();

        const value = this.ast.body.createDataflowNode(this.env).value;
        const variable = this.env.resolveRef(this.ast.ref, this.ast.range);
        variable.value = value;
        this.value = UnspecifiedValue.instance;
    }

    public reevaluate(): void {
        throw new Error("AssignDataflowNode.reevaluate() not implemented");
    }

    public detach(): void {
        throw new Error("AssignDataflowNode.reevaluate() not implemented");
    }
}

export class IfDataflowNode extends DataflowNode {
    public constructor(public ast: IfNode, public env: Environment) {
        super();

        const condValue = this.ast.condition.createDataflowNode(this.env).value;
        if (condValue.isTrue())
            this.value = this.ast.consequent.createDataflowNode(this.env).value;
        else
            this.value = this.ast.alternative.createDataflowNode(this.env).value;
    }

    public reevaluate(): void {
        throw new Error("IfDataflowNode.reevaluate() not implemented");
    }

    public detach(): void {
        throw new Error("IfDataflowNode.reevaluate() not implemented");
    }
}

export class LambdaDataflowNode extends DataflowNode {
    public constructor(public ast: LambdaNode, public env: Environment) {
        super();

        this.value = new LambdaProcedureValue(this.env, this.ast);
    }

    public reevaluate(): void {
        throw new Error("LambdaDataflowNode.reevaluate() not implemented");
    }

    public detach(): void {
        throw new Error("LambdaDataflowNode.reevaluate() not implemented");
    }
}

export class SequenceDataflowNode extends DataflowNode {
    public constructor(public ast: SequenceNode, public env: Environment) {
        super();

        this.ast.body.createDataflowNode(this.env);
        this.value = this.ast.next.createDataflowNode(this.env).value;
    }

    public reevaluate(): void {
        throw new Error("SequenceDataflowNode.reevaluate() not implemented");
    }

    public detach(): void {
        throw new Error("SequenceDataflowNode.reevaluate() not implemented");
    }
}

export class ApplyDataflowNode extends DataflowNode {
    public constructor(public ast: ApplyNode, public env: Environment) {
        super();

        const procValue: Value = this.ast.proc.createDataflowNode(this.env).value;
        const argArray: Value[] = [];
        for (let i = 0; i < this.ast.args.length; i++) {
            const arg = this.ast.args[i];
            argArray.push(arg.createDataflowNode(this.env).value);
        }

        if (procValue instanceof BuiltinProcedureValue) {
            this.value = procValue.direct(argArray);
        }
        else if (procValue instanceof LambdaProcedureValue) {
            this.value = ApplyDataflowNode.evalLambda(procValue, argArray, this.ast.range);
        }
        else {
            const msg = "Cannot apply " + procValue;
            const error = new BuildError(this.ast.range, msg);
            throw new SchemeException(new ErrorValue(error));
        }
    }

    public static evalLambda(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange): Value {
        const outerEnv = procValue.env;
        const lambdaNode = procValue.proc;

        const expectedArgCount = lambdaNode.variables.length;
        const actualArgCount = argArray.length;
        if (actualArgCount !== expectedArgCount) {
            const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
            const error = new BuildError(range, msg);
            throw new SchemeException(new ErrorValue(error));
        }

        const innerEnv = bindLambdaArguments(argArray, lambdaNode, outerEnv);
        const node = procValue.proc.body.createDataflowNode(innerEnv);
        return node.value;
    }

    public reevaluate(): void {
        throw new Error("ApplyDataflowNode.reevaluate() not implemented");
    }

    public detach(): void {
        throw new Error("ApplyDataflowNode.reevaluate() not implemented");
    }
}

export class VariableDataflowNode extends DataflowNode {
    public constructor(public ast: VariableNode, public env: Environment) {
        super();

        const variable = this.env.resolveRef(this.ast.ref, this.ast.range);
        this.value = variable.value;
    }

    public reevaluate(): void {
        throw new Error("VariableDataflowNode.reevaluate() not implemented");
    }

    public detach(): void {
        throw new Error("VariableDataflowNode.reevaluate() not implemented");
    }
}

export class LetrecDataflowNode extends DataflowNode {
    public constructor(public ast: LetrecNode, public env: Environment) {
        super();

        const innerEnv = new Environment(this.ast.innerScope, this.env);
        const bindingArray: Value[] = [];
        for (const binding of this.ast.bindings)
            bindingArray.push(binding.body.createDataflowNode(innerEnv).value);
        bindLetrecValues(bindingArray, this.ast, innerEnv);
        this.value = this.ast.body.createDataflowNode(innerEnv).value;
    }

    public reevaluate(): void {
        throw new Error("LetrecDataflowNode.reevaluate() not implemented");
    }

    public detach(): void {
        throw new Error("LetrecDataflowNode.reevaluate() not implemented");
    }
}

export class InputDataflowNode extends DataflowNode {
    public constructor(initialValue: Value) {
        super();
        this.value = initialValue;
    }

    public reevaluate(): void {
        // Nothing to do here
    }

    public detach(): void {
        // Nothing to do here
    }
}
