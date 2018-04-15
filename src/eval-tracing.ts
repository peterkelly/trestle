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

export interface CellWriter {
    println(msg: string[]): void;
}

interface WriteOptions {
    abbrev?: boolean;
    width?: number;
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
                while ((input[pos] >= "0") && (input[pos] <= "9"))
                    pos++;
                if (input[pos] === "m")
                    pos++;
            }
        }
        else {
            output += input[pos];
            pos++;
        }
    }
    return output;
}

export abstract class Cell {
    public readonly _class_Cell: any;
    public value: Value;
    public children: Cell[] = [];
    public abstract name: string;
    public parent: Cell | null = null;
    public readonly id: number;
    private static nextId: number = 0;
    private liveBindings: BindingSet;
    public isDirty: boolean = false;

    public constructor(bindings: BindingSet, value?: Value) {
        this.liveBindings = bindings.clone();
        this.id = Cell.nextId++;
        if (this.parent !== null)
            this.parent.children.push(this);
        if (value !== undefined)
            this.value = value;
        else
            this.value = UnspecifiedValue.instance;
    }

    public abstract evaluate(env: Environment, bindings: BindingSet): void;

    public addChild(cell: Cell): void {
        const index = this.children.indexOf(cell);
        if (index >= 0)
            throw new Error("addChild: cell already exists in children array");
        if (cell.parent !== null)
            throw new Error("addChild: cell already has another parent");
        this.children.push(cell);
        cell.parent = this;
    }

    public write(writer: CellWriter, prefix: string, indent: string, options: WriteOptions): void {
        Cell.writeCell(this, writer, prefix, indent, options);
    }

    public static writeCell(cell: Cell, writer: CellWriter, prefix: string, indent: string, options: WriteOptions): void {
        // let line = prefix + this.name;
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
        if (cell.isDirty)
            name = "\x1b[7m" + name + "\x1b[0m";
        const line = prefix + "#" + cell.id + " " + name;
        const entries = Array.from(cell.liveBindings.bindings.entries()).sort(([a, ac], [b, bc]) => {
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

        writer.println([line, varColumn]);
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
            child.write(writer, childPrefix, childIndent, options);
        }
    }

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

    public treeToString(options?: WriteOptions): string {
        options = options || {};
        const lineParts: string[][] = [];
        let columns = 0;
        const writer: CellWriter = {
            println(msg: string[]): void {
                lineParts.push(msg);
                columns = Math.max(columns, msg.length);
            }
        };
        this.write(writer, "", "", options);
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
        for (const child of this.children)
            child.release();
        this.children.length = 0;
    }
}

export class SimpleCell extends Cell {
    public readonly _class_SimpleCell: any;

    public constructor(bindings: BindingSet, value: Value) {
        super(bindings, value);
    }

    public get name(): string {
        return "SimpleCell " + (<any> this.value).constructor.name;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        throw new Error("SimpleCell.evaluate() not implemented");
    }
}

export class ConstantCell extends Cell {
    public readonly _class_ConstantCell: any;
    public readonly kind: "constant" = "constant";
    public readonly node: ConstantNode;

    public constructor(node: ConstantNode, bindings: BindingSet) {
        super(bindings);
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        this.clear();
        this.value = this.node.value.toValue();
    }
}

export class AssignCell extends Cell {
    public readonly _class_AssignCell: any;
    public readonly kind: "assign" = "assign";
    public readonly node: AssignNode;

    public constructor(node: AssignNode, bindings: BindingSet) {
        super(bindings);
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        this.clear();
        const variable = env.resolveRef(this.node.ref, this.node.range);

        const valueCell = evalTracing(this.node.body, env, bindings);
        this.addChild(valueCell);
        variable.cell = valueCell;
        const writeCell = new WriteCell(bindings, variable, valueCell);
        this.addChild(writeCell);
    }
}

export class WriteCell extends Cell {
    public readonly _class_AssignCell: any;
    public readonly kind: "write" = "write";
    public readonly variable: Variable;
    public readonly cell: Cell;

    public constructor(bindings: BindingSet, variable: Variable, cell: Cell) {
        super(bindings);
        this.variable = variable;
        this.cell = cell;
        bindings.bindings.set(this.variable, {
            variable: this.variable,
            cell: this.cell,
            writer: this,
        });
    }

    public get name(): string {
        return "write " + this.variable.slot.name;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        throw new Error("WriteCell.evaluate() not implemented");
    }
}

export class IfCell extends Cell {
    public readonly _class_extends: any;
    public readonly kind: "if" = "if";
    public readonly node: IfNode;

    public constructor(node: IfNode, bindings: BindingSet) {
        super(bindings);
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        this.clear();
        const condValueCell = evalTracing(this.node.condition, env, bindings);
        this.addChild(condValueCell);
        const condValue = condValueCell.value;
        if (condValue.isTrue()) {
            const branchCell = evalTracing(this.node.consequent, env, bindings);
            this.addChild(branchCell);
            const branchValue = branchCell.value;
            this.value = branchValue;
        }
        else {
            const branchCell = evalTracing(this.node.alternative, env, bindings);
            this.addChild(branchCell);
            const branchValue = branchCell.value;
            this.value = branchValue;
        }
    }
}

export class LambdaCell extends Cell {
    public readonly _class_LambdaCell: any;
    public readonly kind: "lambda" = "lambda";
    public readonly node: LambdaNode;

    public constructor(node: LambdaNode, bindings: BindingSet) {
        super(bindings);
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        this.clear();
        this.value = new LambdaProcedureValue(env, this.node);
    }
}

export class CallCell extends Cell {
    public readonly _class_CallCell: any;
    public readonly kind: "call" = "call";
    public readonly procValue: LambdaProcedureValue;
    public readonly argCells: Cell[];
    public readonly range: SourceRange;

    public constructor(procValue: LambdaProcedureValue, argCells: Cell[],
        range: SourceRange,
        bindings: BindingSet) {
        super(bindings);
        this.procValue = procValue,
        this.argCells = argCells;
        this.range = range;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        this.clear();
        const lambdaNode = this.procValue.proc;

        const expectedArgCount = lambdaNode.variables.length;
        const actualArgCount = this.argCells.length;
        if (actualArgCount !== expectedArgCount) {
            const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
            const error = new BuildError(this.range, msg);
            throw new SchemeException(new ErrorValue(error));
        }

        const innerEnv = new Environment(lambdaNode.innerScope, env);
        innerEnv.setVariableCells(this.argCells);
        const bodyCell = evalTracing(this.procValue.proc.body, innerEnv, bindings);
        this.addChild(bodyCell);
        const bodyValue = bodyCell.value;
        this.value = bodyValue;
    }
}

export class SequenceCell extends Cell {
    public readonly _class_SequenceCell: any;
    public readonly kind: "sequence" = "sequence";
    public readonly node: SequenceNode;

    public constructor(node: SequenceNode, bindings: BindingSet) {
        super(bindings);
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        this.clear();
        const ignoreCell = evalTracing(this.node.body, env, bindings);
        this.addChild(ignoreCell);
        const resultCell = evalTracing(this.node.next, env, bindings);
        this.addChild(resultCell);
        const resultValue = resultCell.value;
        this.value = resultValue;
    }
}

export class ApplyCell extends Cell {
    public readonly _class_ApplyCell: any;
    public readonly kind: "apply" = "apply";
    public readonly node: ApplyNode;

    public constructor(node: ApplyNode, bindings: BindingSet) {
        super(bindings);
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        this.clear();
        const procCell = evalTracing(this.node.proc, env, bindings);
        this.addChild(procCell);
        const procValue = procCell.value;
        const argCells: Cell[] = [];
        for (let i = 0; i < this.node.args.length; i++) {
            const arg = this.node.args[i];
            const argCell = evalTracing(arg, env, bindings);
            this.addChild(argCell);
            argCells.push(argCell);
        }

        if (procValue instanceof BuiltinProcedureValue) {
            const argValues = argCells.map(cell => cell.value);
            const resultValue = procValue.direct(argValues);
            this.value = resultValue;
        }
        else if (procValue instanceof LambdaProcedureValue) {
            const resultCell = evalLambdaTracing(procValue, argCells, this.node.range, this, bindings);
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

    public constructor(node: VariableNode, bindings: BindingSet) {
        super(bindings);
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        this.clear();
        const variable = env.resolveRef(this.node.ref, this.node.range);
        const valueCell = variable.cell;
        if (valueCell === undefined)
            throw new Error("Variable " + variable.slot.name + " does not have a cell");
        const readCell = new ReadCell(bindings, variable);
        this.addChild(readCell);
        this.value = valueCell.value;
    }
}

export class ReadCell extends Cell {
    public readonly _class_ReadCell: any;
    public readonly kind: "read" = "read";
    public readonly variable: Variable;

    public constructor(bindings: BindingSet, variable: Variable) {
        super(bindings);
        this.variable = variable;
    }

    public get name(): string {
        return "read " + this.variable.slot.name;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        throw new Error("ReadCell.evaluate() not implemented");
    }
}

export class LetrecCell extends Cell {
    public readonly _class_LetrecCell: any;
    public readonly kind: "letrec" = "letrec";
    public readonly node: LetrecNode;

    public constructor(node: LetrecNode, bindings: BindingSet) {
        super(bindings);
        this.node = node;
    }

    public get name(): string {
        return this.kind;
    }

    public evaluate(env: Environment, bindings: BindingSet): void {
        // FIXME: Need to create cells for each entry, and record the assignments that happen
        // when initialising the inner environment. Similarly for lambda.
        this.clear();
        const innerEnv = new Environment(this.node.innerScope, env);
        const cellArray: Cell[] = [];
        for (const binding of this.node.bindings) {
            const varCell = evalTracing(binding.body, innerEnv, bindings);
            this.addChild(varCell);
            cellArray.push(varCell);
        }
        innerEnv.setVariableCells(cellArray);
        const bodyCell = evalTracing(this.node.body, innerEnv, bindings);
        this.addChild(bodyCell);
        const bodyValue = bodyCell.value;
        this.value = bodyValue;
    }
}

export class InputCell extends Cell {
    public readonly _class_InputCell: any;
    public readonly kind: "input" = "input";
    public readonly inputName: string;
    public readonly node: InputNode;
    public dfnode: InputDataflowNode | null = null;
    private listener: ValueChangeListener;

    public constructor(node: InputNode, bindings: BindingSet, inputName: string) {
        super(bindings);
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

    public evaluate(env: Environment, bindings: BindingSet): void {
        const dfnode = getInput(this.node.name);
        this.setDataflowNode(dfnode);
        this.value = dfnode.value;
    }
}

export function evalTracing(node: ASTNode, env: Environment, bindings: BindingSet): Cell {
    switch (node.kind) {
        case "constant": {
            const cell = new ConstantCell(node, bindings);
            cell.evaluate(env, bindings);
            return cell;
        }
        case "try": {
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        }
        case "throw": {
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        }
        case "assign": {
            const cell = new AssignCell(node, bindings);
            cell.evaluate(env, bindings);
            return cell;
        }
        case "if": {
            const cell = new IfCell(node, bindings);
            cell.evaluate(env, bindings);
            return cell;
        }
        case "lambda": {
            const cell = new LambdaCell(node, bindings);
            cell.evaluate(env, bindings);
            return cell;
        }
        case "sequence": {
            const cell = new SequenceCell(node, bindings);
            cell.evaluate(env, bindings);
            return cell;
        }
        case "apply": {
            const cell = new ApplyCell(node, bindings);
            cell.evaluate(env, bindings);
            return cell;
        }
        case "variable": {
            const cell = new VariableCell(node, bindings);
            cell.evaluate(env, bindings);
            return cell;
        }
        case "letrec": {
            const cell = new LetrecCell(node, bindings);
            cell.evaluate(env, bindings);
            return cell;
        }
        case "input": {
            const cell = new InputCell(node, bindings, node.name);
            cell.evaluate(env, bindings);
            return cell;
        }
    }
}

export function evalLambdaTracing(procValue: LambdaProcedureValue, argCells: Cell[],
    range: SourceRange, parent: Cell, bindings: BindingSet): Cell {
    const cell = new CallCell(procValue, argCells, range, bindings);
    if (parent !== null)
        parent.addChild(cell);
    cell.evaluate(cell.procValue.env, bindings);
    return cell;
}
