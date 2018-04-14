import { ASTNode, LambdaProcedureValue } from "./ast";
import { BuildError } from "./sexpr";
import { SourceRange } from "./source";
import { Value, ErrorValue, UnspecifiedValue } from "./value";
import { Variable, Environment, SchemeException } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";
import { getInput } from "./dataflow";

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

export abstract class Cell {
    public readonly _class_Cell: any;
    public value: Value;
    public children: Cell[] = [];
    public abstract name: string;
    public readonly parent: Cell | null;
    public readonly id: number;
    private static nextId: number = 0;
    private liveBindings: BindingSet;

    public constructor(bindings: BindingSet, parent: Cell | null, value?: Value) {
        this.liveBindings = bindings.clone();
        this.id = Cell.nextId++;
        this.parent = parent;
        if (this.parent !== null)
            this.parent.children.push(this);
        if (value !== undefined)
            this.value = value;
        else
            this.value = UnspecifiedValue.instance;
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

        let line = prefix + "#" + cell.id + " " + cell.name;
        // if ((options.width !== undefined) && (cell.liveBindings !== undefined)) {
            const entries = Array.from(cell.liveBindings.bindings.entries()).sort(([a, ac], [b, bc]) => {
                if (a.slot.name < b.slot.name)
                    return -1;
                else if (a.slot.name > b.slot.name)
                    return 1;
                else
                    return 0;
            }).map(([key, value]) => value);
            // line = line.padEnd(options.width) + " |";
            let varColumn = "";
            for (const binding of entries)
                varColumn += " " + binding.variable.slot.name + "=#" + binding.cell.id + "=" + binding.cell.value;
        // }
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
                widths[col] = Math.max(widths[col], lineParts[lineno][col].length);
        }
        for (let lineno = 0; lineno < lineParts.length; lineno++) {
            for (let col = 0; col < lineParts[lineno].length; col++)
                lineParts[lineno][col] = lineParts[lineno][col].padEnd(widths[col]);
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
}

export class SimpleCell extends Cell {
    public readonly _class_SimpleCell: any;

    public constructor(bindings: BindingSet, value: Value) {
        super(bindings, null, value);
    }

    public get name(): string {
        return "SimpleCell " + (<any> this.value).constructor.name;
    }
}

export class ConstantCell extends Cell {
    public readonly _class_ConstantCell: any;
    public readonly kind: "constant" = "constant";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class TryCell extends Cell {
    public readonly _class_extends: any;
    public readonly kind: "try" = "try";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class ThrowCell extends Cell {
    public readonly _class_ThrowCell: any;
    public readonly kind: "throw" = "throw";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class SetCell extends Cell {
    public readonly _class_AssignCell: any;
    public readonly kind: "set" = "set";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class WriteCell extends Cell {
    public readonly _class_AssignCell: any;
    public readonly kind: "write" = "write";
    public readonly variable: Variable;
    public readonly cell: Cell;

    public constructor(bindings: BindingSet, parent: Cell | null, variable: Variable, cell: Cell) {
        super(bindings, parent);
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
}

export class IfCell extends Cell {
    public readonly _class_extends: any;
    public readonly kind: "if" = "if";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class LambdaCell extends Cell {
    public readonly _class_LambdaCell: any;
    public readonly kind: "lambda" = "lambda";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class SequenceCell extends Cell {
    public readonly _class_SequenceCell: any;
    public readonly kind: "sequence" = "sequence";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class ApplyCell extends Cell {
    public readonly _class_ApplyCell: any;
    public readonly kind: "apply" = "apply";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class ReadCell extends Cell {
    public readonly _class_VariableCell: any;
    public readonly kind: "read" = "read";
    public readonly variable: Variable;

    public constructor(bindings: BindingSet, parent: Cell | null, variable: Variable) {
        super(bindings, parent);
        this.variable = variable;
    }

    public get name(): string {
        return "read " + this.variable.slot.name;
    }
}

export class LetrecCell extends Cell {
    public readonly _class_LetrecCell: any;
    public readonly kind: "letrec" = "letrec";

    public constructor(bindings: BindingSet, parent: Cell | null) {
        super(bindings, parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class InputCell extends Cell {
    public readonly _class_InputCell: any;
    public readonly kind: "input" = "input";
    public readonly inputName: string;

    public constructor(bindings: BindingSet, parent: Cell | null, inputName: string) {
        super(bindings, parent);
        this.inputName = inputName;
    }

    public get name(): string {
        return "input[" + JSON.stringify(this.inputName) + "]";
    }
}

export function evalTracing(node: ASTNode, env: Environment, parent: Cell | null, bindings: BindingSet): Cell {
    switch (node.kind) {
        case "constant": {
            const cell = new ConstantCell(bindings, parent);
            cell.value = node.value.toValue();
            return cell;
        }
        case "try": {
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        }
        case "throw": {
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        }
        case "assign": {
            const variable = env.resolveRef(node.ref, node.range);
            const cell = new SetCell(bindings, parent);

            const valueCell = evalTracing(node.body, env, cell, bindings);
            // const value = valueCell.value;
            // variable.value = value;
            variable.cell = valueCell;
            new WriteCell(bindings, cell, variable, valueCell);
            return cell;
        }
        case "if": {
            const cell = new IfCell(bindings, parent);
            const condValueCell = evalTracing(node.condition, env, cell, bindings);
            const condValue = condValueCell.value;
            if (condValue.isTrue()) {
                const branchCell = evalTracing(node.consequent, env, cell, bindings);
                const branchValue = branchCell.value;
                cell.value = branchValue;
            }
            else {
                const branchCell = evalTracing(node.alternative, env, cell, bindings);
                const branchValue = branchCell.value;
                cell.value = branchValue;
            }
            return cell;
        }
        case "lambda": {
            const cell = new LambdaCell(bindings, parent);
            cell.value = new LambdaProcedureValue(env, node);
            return cell;
        }
        case "sequence": {
            let cell: Cell;
            // if ((parent !== null) && (parent instanceof SequenceCell))
            //     cell = parent;
            // else
                cell = new SequenceCell(bindings, parent);
            // const cell = new SequenceCell(bindings, parent);
            const ignoreCell = evalTracing(node.body, env, cell, bindings);
            void ignoreCell;
            const resultCell = evalTracing(node.next, env, cell, bindings);
            const resultValue = resultCell.value;
            cell.value = resultValue;
            return cell;
        }
        case "apply": {
            const cell = new ApplyCell(bindings, parent);
            const procCell = evalTracing(node.proc, env, cell, bindings);
            const procValue = procCell.value;
            const argCells: Cell[] = [];
            for (let i = 0; i < node.args.length; i++) {
                const arg = node.args[i];
                const argCell = evalTracing(arg, env, cell, bindings);
                argCells.push(argCell);
            }

            if (procValue instanceof BuiltinProcedureValue) {
                const argValues = argCells.map(cell => cell.value);
                const resultValue = procValue.direct(argValues);
                cell.value = resultValue;
            }
            else if (procValue instanceof LambdaProcedureValue) {
                const resultCell = evalLambdaTracing(procValue, argCells, node.range, cell, bindings);
                const resultValue = resultCell.value;
                cell.value = resultValue;
            }
            else {
                const msg = "Cannot apply " + procValue;
                const error = new BuildError(node.range, msg);
                throw new SchemeException(new ErrorValue(error));
            }
            return cell;
        }
        case "variable": {
            const variable = env.resolveRef(node.ref, node.range);
            // const cell = new ReadCell(bindings, parent, variable);
            const valueCell = variable.cell;
            if (valueCell === undefined)
                throw new Error("Variable " + variable.slot.name + " does not have a cell");
            // const value = variable.value;
            // const value = valueCell.value;
            // cell.value = value;
            // return cell;
            new ReadCell(bindings, parent, variable);
            return valueCell;
        }
        case "letrec": {
            const cell = new LetrecCell(bindings, parent);
            const innerEnv = new Environment(node.innerScope, env);
            const cellArray: Cell[] = [];
            for (const binding of node.bindings) {
                const varCell = evalTracing(binding.body, innerEnv, cell, bindings);
                cellArray.push(varCell);
            }
            innerEnv.setVariableCells(cellArray);
            const bodyCell = evalTracing(node.body, innerEnv, cell, bindings);
            const bodyValue = bodyCell.value;
            cell.value = bodyValue;
            return cell;
        }
        case "input": {
            const cell = new InputCell(bindings, parent, node.name);
            const inputDataflowNode = getInput(node.name);
            cell.value = inputDataflowNode.value;
            return cell;
        }
    }
}

export function evalLambdaTracing(procValue: LambdaProcedureValue, argCells: Cell[],
    range: SourceRange, parent: Cell, bindings: BindingSet): Cell {
    const outerEnv = procValue.env;
    const lambdaNode = procValue.proc;
    const cell = new LambdaCell(bindings, parent);

    const expectedArgCount = lambdaNode.variables.length;
    const actualArgCount = argCells.length;
    if (actualArgCount !== expectedArgCount) {
        const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
        const error = new BuildError(range, msg);
        throw new SchemeException(new ErrorValue(error));
    }

    const innerEnv = new Environment(lambdaNode.innerScope, outerEnv);
    innerEnv.setVariableCells(argCells);
    const bodyCell = evalTracing(procValue.proc.body, innerEnv, cell, bindings);
    const bodyValue = bodyCell.value;
    cell.value = bodyValue;
    return cell;
}
