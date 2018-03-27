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
} from "./ast";

const allInputs = new Map<string, InputDataflowNode>();
let dirtyNodes: DataflowNode[] = [];

export interface DataflowCallInfo {
    argNodes: DataflowNode[] | null;
    existing: DataflowNode | null;
}

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

        const node = this.ast.body.createDataflowNode(env);
        const variable = env.resolveRef(this.ast.ref, this.ast.range);
        variable.node = node;
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
    private cond: DataflowNode;
    private isTrue: boolean;
    private branch: DataflowNode;

    public constructor(public ast: IfNode, public env: Environment) {
        super();

        this.cond = this.ast.condition.createDataflowNode(this.env);
        this.cond.addOutput(this);
        this.isTrue = this.cond.value.isTrue();

        if (this.isTrue)
            this.branch = this.ast.consequent.createDataflowNode(this.env);
        else
            this.branch = this.ast.alternative.createDataflowNode(this.env);
        this.branch.addOutput(this);
        this.value = this.branch.value;
    }

    public reevaluate(): void {
        if (this.isTrue !== this.cond.value.isTrue()) {
            this.trace("Condition changed to " + this.cond.value.isTrue());
            this.branch.removeOutput(this);
            this.isTrue = this.cond.value.isTrue();
            if (this.isTrue)
                this.branch = this.ast.consequent.createDataflowNode(this.env);
            else
                this.branch = this.ast.alternative.createDataflowNode(this.env);
            this.branch.addOutput(this);
            this.markOutputsAsDirty();
        }

        this.updateValue(this.branch.value);
    }

    public detach(): void {
        this.cond.removeOutput(this);
        this.branch.removeOutput(this);
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
    private next: DataflowNode;

    public constructor(public ast: SequenceNode, public env: Environment) {
        super();

        this.ast.body.createDataflowNode(this.env);
        this.next = this.ast.next.createDataflowNode(this.env);
        this.next.addOutput(this);
        this.value = this.next.value;
    }

    public reevaluate(): void {
        this.updateValue(this.next.value);
    }

    public detach(): void {
        this.next.removeOutput(this);
    }
}

export class BuiltinCallDataflowNode extends DataflowNode {
    public constructor(private procValue: BuiltinProcedureValue, private args: DataflowNode[]) {
        super();
        for (const arg of this.args)
            arg.addOutput(this);
        const argValues = this.args.map(arg => arg.value);
        this.value = this.procValue.direct(argValues);
    }

    public toString(): string {
        return super.toString() + " (" + this.procValue.name + ")";
    }

    public reevaluate(): void {
        const argValues = this.args.map(a => a.value);
        const df: DataflowCallInfo = {
            argNodes: this.args,
            existing: this,
        };
        this.updateValue(this.procValue.direct(argValues, df));
    }

    public detach(): void {
        for (const arg of this.args)
            arg.removeOutput(this);
    }
}

function bindLambdaArgumentNodes(args: DataflowNode[], lambdaNode: LambdaNode, outerEnv: Environment): Environment {
    const innerEnv = new Environment(lambdaNode.innerScope, outerEnv);
    for (let i = 0; i < args.length; i++) {
        if (i >= lambdaNode.variables.length) { // sanity check
            throw new Error("Invalid argument number: more than # variables");
        }
        if (i >= lambdaNode.innerScope.slots.length) { // sanity check
            throw new Error("Invalid argument number: more than # slots");
        }
        const variable = innerEnv.getVar(i, lambdaNode.variables[i], lambdaNode.innerScope.slots[i]);
        variable.node = args[i];
    }
    return innerEnv;
}

function createLambdaCallNode(procValue: LambdaProcedureValue, args: DataflowNode[], range: SourceRange): DataflowNode {
    const outerEnv = procValue.env;
    const lambdaNode = procValue.proc;

    const expectedArgCount = lambdaNode.variables.length;
    const actualArgCount = args.length;
    if (actualArgCount !== expectedArgCount) {
        const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
        const error = new BuildError(range, msg);
        throw new SchemeException(new ErrorValue(error));
    }

    const innerEnv = bindLambdaArgumentNodes(args, lambdaNode, outerEnv);
    return procValue.proc.body.createDataflowNode(innerEnv);
}

function createCallNode(procValue: Value, args: DataflowNode[], range: SourceRange): DataflowNode {
    if (procValue instanceof BuiltinProcedureValue) {
        return new BuiltinCallDataflowNode(procValue, args);
    }
    else if (procValue instanceof LambdaProcedureValue) {
        return createLambdaCallNode(procValue, args, range);
    }
    else {
        const msg = "Cannot apply " + procValue;
        const error = new BuildError(range, msg);
        throw new SchemeException(new ErrorValue(error));
    }
}

export class ApplyDataflowNode extends DataflowNode {
    private proc: DataflowNode;
    private procValue: Value;
    private call: DataflowNode;
    private args: DataflowNode[];

    public constructor(public ast: ApplyNode, public env: Environment) {
        super();

        this.proc = this.ast.proc.createDataflowNode(this.env);
        this.proc.addOutput(this);
        this.procValue = this.proc.value;
        this.args = this.ast.args.map(arg => arg.createDataflowNode(this.env));

        this.call = createCallNode(this.procValue, this.args, this.ast.range);
        this.call.addOutput(this);
        this.value = this.call.value;
    }

    public toString(): string {
        if (this.procValue instanceof BuiltinProcedureValue)
            return super.toString() + " (" + this.procValue + ")";
        else if (this.procValue instanceof LambdaProcedureValue)
            return super.toString() + " (lambda)";
        else
            return super.toString() + " (?)";
    }

    public reevaluate(): void {
        // If the procedure node's value has changed, then we need to re-create the portion of
        // the dataflow graph that corresponds to the procedure.
        if (this.procValue !== this.proc.value) {
            this.procValue = this.proc.value;
            this.call.removeOutput(this);
            this.call = createCallNode(this.procValue, this.args, this.ast.range);
            this.call.addOutput(this);
        }

        this.updateValue(this.call.value);
    }

    public detach(): void {
        this.proc.removeOutput(this);
        this.call.removeOutput(this);
    }
}

export class VariableDataflowNode extends DataflowNode {
    private node: DataflowNode;

    public constructor(public ast: VariableNode, public env: Environment) {
        super();

        this.node = this.env.resolveRef(this.ast.ref, this.ast.range).node;
        this.node.addOutput(this);
        this.value = this.node.value;
    }

    public reevaluate(): void {
        this.updateValue(this.node.value);
    }

    public detach(): void {
        this.node.removeOutput(this);
    }
}

function bindLetrecNodes(nodes: DataflowNode[], letrecAst: LetrecNode, innerEnv: Environment): void {
    for (let i = 0; i < nodes.length; i++) {
        if (i >= letrecAst.bindings.length) { // sanity check
            throw new Error("Invalid argument number: more than # bindings");
        }
        if (i >= letrecAst.innerScope.slots.length) { // sanity check
            throw new Error("Invalid argument number: more than # slots");
        }
        const variable = innerEnv.getVar(i, letrecAst.bindings[i].ref.target.name, letrecAst.innerScope.slots[i]);
        variable.node = nodes[i];
    }
}

export class LetrecDataflowNode extends DataflowNode {
    private body: DataflowNode;

    public constructor(ast: LetrecNode, env: Environment) {
        super();

        const innerEnv = new Environment(ast.innerScope, env);
        const bindingArray: DataflowNode[] = [];
        for (const binding of ast.bindings)
            bindingArray.push(binding.body.createDataflowNode(innerEnv));
        bindLetrecNodes(bindingArray, ast, innerEnv);

        this.body = ast.body.createDataflowNode(innerEnv);
        this.body.addOutput(this);
        this.value = this.body.value;
    }

    public reevaluate(): void {
        this.updateValue(this.body.value);
    }

    public detach(): void {
        this.body.removeOutput(this);
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
