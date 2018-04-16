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
    ASTNode,
    LambdaProcedureValue,
    ConstantNode,
    AssignNode,
    IfNode,
    LambdaNode,
    SequenceNode,
    ApplyNode,
    VariableNode,
    LetrecNode,
    InputNode,
} from "./ast";
import { BuildError } from "./sexpr";
import { SourceRange } from "./source";
import { Value, ErrorValue, UnspecifiedValue } from "./value";
import { Variable, Environment, SchemeException } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";
import { getInput, InputDataflowNode, ValueChangeListener } from "./dataflow";

export interface CellPrinter {
    println(msg: string[]): void;
}

interface PrintOptions {
    abbrev?: boolean;
    width?: number;
    generation?: number;
}

interface LiveBinding {
    variable: Variable;
    cell: Cell;
    writer: WriteCell;
}

export class BindingSet {
    public readonly _class_BindingSet: any;
    public bindings: Map<Variable, LiveBinding>;
    public constructor(bindings?: Map<Variable, LiveBinding>) {
        if (bindings !== undefined)
            this.bindings = bindings;
        else
            this.bindings = new Map<Variable, LiveBinding>();
    }

    public clone(): BindingSet {
        const map = new Map<Variable, LiveBinding>();
        for (const [key, value] of this.bindings.entries()) {
            map.set(key, {
                variable: value.variable,
                cell: value.cell,
                writer: value.writer,
            });
        }
        return new BindingSet(map);
    }
}

export function removeEscapeCodes(input: string): string {
    let output: string = "";
    let pos = 0;
    while (pos < input.length) {
        if (input[pos] === "\x1b") {
            pos++;
            if (input[pos] === "[") {
                pos++;
                while (true) {
                    while ((input[pos] >= "0") && (input[pos] <= "9"))
                        pos++;
                    if (input[pos] === ";") {
                        pos++;
                        continue;
                    }
                    if (input[pos] === "m") {
                        pos++;
                    }
                    break;
                }
            }
        }
        else {
            output += input[pos];
            pos++;
        }
    }
    return output;
}

export function makeVarColumn(bindings: BindingSet): string {
    const entries = Array.from(bindings.bindings.entries()).sort(([a, ac], [b, bc]) => {
        if (a.slot.name < b.slot.name)
            return -1;
        else if (a.slot.name > b.slot.name)
            return 1;
        else
            return 0;
    }).map(([key, value]) => value);
    let varColumn = "";
    for (const binding of entries)
        varColumn += " " + binding.variable.slot.name + "=#" + binding.cell.id + "=" + binding.cell.value;
    return varColumn;
}

export function printCell(cell: Cell, writer: CellPrinter, prefix: string, indent: string,
    bindings: BindingSet, options: PrintOptions): void {

    let children: Cell[];
    if (options.abbrev) {
        children = Cell.filterCellsForDisplay(cell.children);
        while ((cell instanceof ApplyCell) && (children.length === 1)) {
            cell = children[0];
            children = Cell.filterCellsForDisplay(cell.children);
        }
    }
    else {
        children = cell.children;
    }


    let name = cell.name;
    let id = "#" + cell.id;
    // if ((options.generation !== undefined) && (cell.generation >= options.generation)) {
    //     id = "\x1b[97;44;1m" + id + "\x1b[0m";
    // }
    if (cell.generation === 1) {
        id = "\x1b[97;44m" + id + "\x1b[0m";
    }
    if (cell.generation === 2) {
        id = "\x1b[97;41m" + id + "\x1b[0m";
    }
    if (cell.isDirty)
        name = "\x1b[7m" + name + "\x1b[0m";
    const line = prefix + id + " " + name;
    const varColumn = makeVarColumn(bindings);

    writer.println([line, varColumn]);

    if (cell instanceof WriteCell) {
        bindings.bindings.set(cell.variable, {
            variable: cell.variable,
            cell: cell.cell,
            writer: cell,
        });
    }

    for (let i = 0; i < children.length; i++) {
        let childPrefix: string;
        let childIndent: string;
        if (i + 1 < children.length) {
            childPrefix = indent + "├── ";
            childIndent = indent + "│   ";
        }
        else {
            childPrefix = indent + "└── ";
            childIndent = indent + "    ";
        }
        const child = children[i];
        printCell(child, writer, childPrefix, childIndent, bindings, options);
    }
}

export function treeToString(root: Cell, bindings: BindingSet, options?: PrintOptions): string {
    bindings = bindings.clone();
    options = options || {};
    const lineParts: string[][] = [];
    let columns = 0;
    const writer: CellPrinter = {
        println(msg: string[]): void {
            lineParts.push(msg);
            columns = Math.max(columns, msg.length);
        }
    };
    printCell(root, writer, "", "", bindings, options);
    const widths: number[] = [];
    for (let i = 0; i < columns; i++)
        widths.push(0);
    for (let lineno = 0; lineno < lineParts.length; lineno++) {
        for (let col = 0; col < lineParts[lineno].length; col++)
            widths[col] = Math.max(widths[col], removeEscapeCodes(lineParts[lineno][col]).length);
    }
    for (let lineno = 0; lineno < lineParts.length; lineno++) {
        for (let col = 0; col < lineParts[lineno].length; col++) {
            let str = lineParts[lineno][col];
            let len = removeEscapeCodes(str).length;
            while (len < widths[col]) {
                str += " ";
                len++;
            }
            lineParts[lineno][col] = str;
        }
    }
    const actualLines = lineParts.map(cols => cols.join(" "));
    return actualLines.join("\n");
}

export abstract class Cell {
    public readonly _class_Cell: any;
    public value: Value;
    public children: Cell[] = [];
    public abstract name: string;
    public parent: Cell | null = null;
    public readonly id: number;
    public readonly generation: number;
    private static nextId: number = 0;
    public static currentGeneration: number = 0;
    public isDirty: boolean = false;

    public constructor(value?: Value) {
        this.id = Cell.nextId++;
        this.generation = Cell.currentGeneration;
        if (this.parent !== null)
            this.parent.children.push(this);
        if (value !== undefined)
            this.value = value;
        else
            this.value = UnspecifiedValue.instance;
    }

    public abstract evaluate(): void;

    public addChild(cell: Cell): void {
        const index = this.children.indexOf(cell);
        if (index >= 0)
            throw new Error("addChild: cell already exists in children array");
        if (cell.parent !== null)
            throw new Error("addChild: cell already has another parent");
        this.children.push(cell);
        cell.parent = this;
    }

    // public write(writer: CellWriter, prefix: string, indent: string, options: WriteOptions): void {
    //     writeCell(this, writer, prefix, indent, options);
    // }

    public static filterCellsForDisplay(cells: Cell[]): Cell[] {
        const selected: Cell[] = [];
        for (const cell of cells) {
            let skip = false;
            if ((cell instanceof ReadCell) && (cell.variable.builtin))
                skip = true;
            else if (cell instanceof ConstantCell)
                skip = true;
            // else if (cell instanceof InputCell)
            //     skip = true;
            if (!skip)
                selected.push(cell);
        }
        return selected;
    }

    public findVars(vars: Set<Variable>): void {
        if ((this instanceof ReadCell) || (this instanceof WriteCell))
            vars.add(this.variable);
        for (const child of this.children)
            child.findVars(vars);
    }

    public release(): void {
        for (const child of this.children)
            child.release();
    }

    public markDirty(): void {
        let cell: Cell | null = this;
        while ((cell !== null) && !cell.isDirty) {
            cell.isDirty = true;
            cell = cell.parent;
        }
    }

    public clear(): void {
        for (const child of this.children) {
            child.release();
            child.parent = null;
        }
        this.children.length = 0;
    }
}

export class SimpleCell extends Cell {
    public readonly _class_SimpleCell: any;

    public constructor(value: Value) {
        super(value);
    }

    public get name(): string {
        return "SimpleCell " + (<any> this.value).constructor.name;
    }

    public evaluate(): void {
        throw new Error("SimpleCell.evaluate() not implemented");
    }
}

export class ConstantCell extends Cell {
    public readonly _class_ConstantCell: any;
    public readonly kind: "constant" = "constant";
    public readonly node: ConstantNode;

    public constructor(node: ConstantNode) {
        super();
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        this.clear();
        this.value = this.node.value.toValue();
    }
}

export class AssignCell extends Cell {
    public readonly _class_AssignCell: any;
    public readonly kind: "assign" = "assign";
    public readonly node: AssignNode;
    private readonly env: Environment;

    public constructor(node: AssignNode, env: Environment) {
        super();
        this.node = node;
        this.env = env;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        this.clear();
        const variable = this.env.resolveRef(this.node.ref, this.node.range);

        const valueCell = evalTracing(this.node.body, this.env);
        this.addChild(valueCell);
        variable.cell = valueCell;
        const writeCell = new WriteCell(variable, valueCell);
        this.addChild(writeCell);
    }
}

export class WriteCell extends Cell {
    public readonly _class_AssignCell: any;
    public readonly kind: "write" = "write";
    public readonly variable: Variable;
    public readonly cell: Cell;

    public constructor(variable: Variable, cell: Cell) {
        super();
        this.variable = variable;
        this.cell = cell;
    }

    public get name(): string {
        return "write " + this.variable.slot.name;
    }

    public evaluate(): void {
        throw new Error("WriteCell.evaluate() not implemented");
    }
}

export class IfCell extends Cell {
    public readonly _class_extends: any;
    public readonly kind: "if" = "if";
    public readonly node: IfNode;
    private readonly env: Environment;
    private readonly condValueCell: Cell;

    public constructor(node: IfNode, env: Environment) {
        super();
        this.node = node;
        this.env = env;
        this.condValueCell = createTracing(this.node.condition, this.env);
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        this.clear();
        this.condValueCell.evaluate();
        this.addChild(this.condValueCell);
        const condValue = this.condValueCell.value;
        let branchCell: Cell;
        if (condValue.isTrue())
            branchCell = createTracing(this.node.consequent, this.env);
        else
            branchCell = createTracing(this.node.alternative, this.env);
        branchCell.evaluate();
        this.addChild(branchCell);
        const branchValue = branchCell.value;
        this.value = branchValue;
    }
}

export class LambdaCell extends Cell {
    public readonly _class_LambdaCell: any;
    public readonly kind: "lambda" = "lambda";
    public readonly node: LambdaNode;
    private readonly env: Environment;

    public constructor(node: LambdaNode, env: Environment) {
        super();
        this.node = node;
        this.env = env;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        this.clear();
        this.value = new LambdaProcedureValue(this.env, this.node);
    }
}

export class CallBindingCell extends Cell {
    public readonly _class_CallBindingCell: any;
    public readonly kind: "call-binding" = "call-binding";
    public readonly variable: Variable;

    public constructor(variable: Variable) {
        super();
        this.variable = variable;
    }

    public get name(): string {
        return "call-binding " + this.variable.slot.name;
    }

    public evaluate(): void {
        throw new Error("CallBindingCell.evaluate() not implemented");
    }
}

export class CallCell extends Cell {
    public readonly _class_CallCell: any;
    public readonly kind: "call" = "call";
    public readonly procValue: LambdaProcedureValue;
    public readonly argCells: Cell[];
    public readonly range: SourceRange;

    public constructor(procValue: LambdaProcedureValue, argCells: Cell[], range: SourceRange) {
        super();
        this.procValue = procValue,
        this.argCells = argCells;
        this.range = range;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        this.clear();
        const lambdaNode = this.procValue.proc;

        const expectedArgCount = lambdaNode.variables.length;
        const actualArgCount = this.argCells.length;
        if (actualArgCount !== expectedArgCount) {
            const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
            const error = new BuildError(this.range, msg);
            throw new SchemeException(new ErrorValue(error));
        }

        const innerEnv = new Environment(lambdaNode.innerScope, this.procValue.env);

        for (let i = 0; i < lambdaNode.variables.length; i++) {
            const variable = innerEnv.variables[i];
            const cell = this.argCells[i];
            variable.cell = cell;
            const callBindingCell = new CallBindingCell(variable);
            this.addChild(callBindingCell);

            const writeCell = new WriteCell(variable, cell);
            callBindingCell.addChild(writeCell);
        }

        const bodyCell = evalTracing(this.procValue.proc.body, innerEnv);
        this.addChild(bodyCell);
        const bodyValue = bodyCell.value;
        this.value = bodyValue;
    }
}

export class SequenceCell extends Cell {
    public readonly _class_SequenceCell: any;
    public readonly kind: "sequence" = "sequence";
    public readonly node: SequenceNode;
    private readonly env: Environment;
    private readonly ignoreCell: Cell;
    private readonly resultCell: Cell;

    public constructor(node: SequenceNode, env: Environment) {
        super();
        this.node = node;
        this.env = env;
        this.ignoreCell = createTracing(this.node.body, this.env);
        this.resultCell = createTracing(this.node.next, this.env);
        this.addChild(this.ignoreCell);
        this.addChild(this.resultCell);
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        this.ignoreCell.evaluate();
        this.resultCell.evaluate();
        const resultValue = this.resultCell.value;
        this.value = resultValue;
    }
}

export class ApplyCell extends Cell {
    public readonly _class_ApplyCell: any;
    public readonly kind: "apply" = "apply";
    public readonly node: ApplyNode;
    private readonly env: Environment;

    public constructor(node: ApplyNode, env: Environment) {
        super();
        this.node = node;
        this.env = env;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        this.clear();
        const procCell = evalTracing(this.node.proc, this.env);
        this.addChild(procCell);
        const procValue = procCell.value;
        const argCells: Cell[] = [];
        for (let i = 0; i < this.node.args.length; i++) {
            const arg = this.node.args[i];
            const argCell = evalTracing(arg, this.env);
            this.addChild(argCell);
            argCells.push(argCell);
        }

        if (procValue instanceof BuiltinProcedureValue) {
            const argValues = argCells.map(cell => cell.value);
            const resultValue = procValue.direct(argValues);
            this.value = resultValue;
        }
        else if (procValue instanceof LambdaProcedureValue) {
            const resultCell = evalLambdaTracing(procValue, argCells, this.node.range, this);
            const resultValue = resultCell.value;
            this.value = resultValue;
        }
        else {
            const msg = "Cannot apply " + procValue;
            const error = new BuildError(this.node.range, msg);
            throw new SchemeException(new ErrorValue(error));
        }
    }
}

export class VariableCell extends Cell {
    public readonly _class_VariableCell: any;
    public readonly kind: "variable" = "variable";
    public readonly node: VariableNode;
    private readonly env: Environment;

    public constructor(node: VariableNode, env: Environment) {
        super();
        this.node = node;
        this.env = env;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        this.clear();
        const variable = this.env.resolveRef(this.node.ref, this.node.range);
        const valueCell = variable.cell;
        if (valueCell === undefined)
            throw new Error("Variable " + variable.slot.name + " does not have a cell");
        const readCell = new ReadCell(variable);
        this.addChild(readCell);
        this.value = valueCell.value;
    }
}

export class ReadCell extends Cell {
    public readonly _class_ReadCell: any;
    public readonly kind: "read" = "read";
    public readonly variable: Variable;

    public constructor(variable: Variable) {
        super();
        this.variable = variable;
    }

    public get name(): string {
        return "read " + this.variable.slot.name;
    }

    public evaluate(): void {
        throw new Error("ReadCell.evaluate() not implemented");
    }
}

export class LetrecBindingCell extends Cell {
    public readonly _class_LetrecBindingCell: any;
    public readonly kind: "letrec-binding" = "letrec-binding";
    public readonly variable: Variable;
    public readonly body: ASTNode;
    private readonly env: Environment;
    private readonly varCell: Cell;
    private readonly writeCell: Cell;

    public constructor(variable: Variable, body: ASTNode, env: Environment) {
        super();
        this.variable = variable;
        this.body = body;
        this.env = env;

        this.varCell = createTracing(this.body, this.env);
        this.writeCell = new WriteCell(this.variable, this.varCell);
        this.addChild(this.varCell);
        this.addChild(this.writeCell);
    }

    public get name(): string {
        return "letrec-binding " + this.variable.slot.name;
    }

    public evaluate(): void {
        this.varCell.evaluate();
        this.variable.cell = this.varCell;
    }
}

export class LetrecCell extends Cell {
    public readonly _class_LetrecCell: any;
    public readonly kind: "letrec" = "letrec";
    public readonly node: LetrecNode;
    private readonly innerEnv: Environment;
    private readonly bindings: Cell[];
    private readonly bodyCell: Cell;

    public constructor(node: LetrecNode, env: Environment) {
        super();
        this.node = node;

        this.innerEnv = new Environment(this.node.innerScope, env);
        this.bindings = [];
        for (let i = 0; i < this.node.bindings.length; i++) {
            const binding = this.node.bindings[i];
            const variable = this.innerEnv.variables[i];
            const bindingCell = new LetrecBindingCell(variable, binding.body, this.innerEnv);
            this.bindings.push(bindingCell);
        }
        this.bodyCell = createTracing(this.node.body, this.innerEnv);

        for (const binding of this.bindings)
            this.addChild(binding);
        this.addChild(this.bodyCell);
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(): void {
        for (const binding of this.bindings)
            binding.evaluate();
        this.bodyCell.evaluate();
        this.value = this.bodyCell.value;
    }
}

export class InputCell extends Cell {
    public readonly _class_InputCell: any;
    public readonly kind: "input" = "input";
    public readonly inputName: string;
    public readonly node: InputNode;
    public dfnode: InputDataflowNode | null = null;
    private listener: ValueChangeListener;

    public constructor(node: InputNode, inputName: string) {
        super();
        this.node = node;
        this.inputName = inputName;
        // this.dfnode = dfnode;
        this.listener = (oldValue, newValue) => {
            // console.log("input cell value changed: " + oldValue + " -> " + newValue);
            this.markDirty();
        };
        // this.dfnode.addChangeListener(this.listener);
    }

    public get name(): string {
        return "input[" + JSON.stringify(this.inputName) + "]";
    }

    public release(): void {
        // this.dfnode.removeChangeListener(this.listener);
        this.setDataflowNode(null);
        super.release();
    }

    public setDataflowNode(newNode: InputDataflowNode | null): void {
        if (this.dfnode !== null)
            this.dfnode.removeChangeListener(this.listener);
        this.dfnode = newNode;
        if (this.dfnode !== null)
            this.dfnode.addChangeListener(this.listener);
    }

    public evaluate(): void {
        const dfnode = getInput(this.node.name);
        this.setDataflowNode(dfnode);
        this.value = dfnode.value;
    }
}

export function evalTracing(node: ASTNode, env: Environment): Cell {
    const cell = createTracing(node, env);
    cell.evaluate();
    return cell;
}

function createTracing(node: ASTNode, env: Environment): Cell {
    switch (node.kind) {
        case "constant":
            return new ConstantCell(node);
        case "try":
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        case "throw":
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        case "assign":
            return new AssignCell(node, env);
        case "if":
            return new IfCell(node, env);
        case "lambda":
            return new LambdaCell(node, env);
        case "sequence":
            return new SequenceCell(node, env);
        case "apply":
            return new ApplyCell(node, env);
        case "variable":
            return new VariableCell(node, env);
        case "letrec":
            return new LetrecCell(node, env);
        case "input":
            return new InputCell(node, node.name);
    }
}

export function evalLambdaTracing(procValue: LambdaProcedureValue, argCells: Cell[],
    range: SourceRange, parent: Cell): Cell {
    const cell = new CallCell(procValue, argCells, range);
    if (parent !== null)
        parent.addChild(cell);
    cell.evaluate();
    return cell;
}
