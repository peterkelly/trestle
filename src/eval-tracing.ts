import { ASTNode, LambdaProcedureValue } from "./ast";
import { BuildError } from "./sexpr";
import { SourceRange } from "./source";
import { Value, ErrorValue, UnspecifiedValue } from "./value";
import { Variable, Environment, SchemeException } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";
import { getInput } from "./dataflow";

export interface CellWriter {
    println(msg: string): void;
}

interface WriteOptions {
    width?: number;
}

interface LiveBinding {
    variable: Variable;
    cell: Cell;
    writer: WriteCell;
}

class BindingSet {
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
    // public assoc = new Map<Variable, Cell>();
    private liveBindings?: BindingSet;

    public computeLiveBindings(current?: BindingSet): void {
        if (current === undefined)
            current = new BindingSet();
        this.liveBindings = current.clone();
        if (this instanceof WriteCell) {
            current.bindings.set(this.variable, {
                variable: this.variable,
                cell: this.cell,
                writer: this,
            });
        }
        for (const child of this.children)
            child.computeLiveBindings(current);
    }

    public constructor(parent: Cell | null, value?: Value) {
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
        // let line = prefix + this.name;
        let line = prefix + "#" + this.id + " " + this.name;
        if ((options.width !== undefined) && (this.liveBindings !== undefined)) {
            const entries = Array.from(this.liveBindings.bindings.entries()).sort(([a, ac], [b, bc]) => {
                if (a.slot.name < b.slot.name)
                    return -1;
                else if (a.slot.name > b.slot.name)
                    return 1;
                else
                    return 0;
            }).map(([key, value]) => value);
            line = line.padEnd(options.width) + " |";
            for (const binding of entries) {
                line += " " + binding.variable.slot.name + "=#" + binding.cell.id;
            }
        }
        writer.println(line);
        for (let i = 0; i < this.children.length; i++) {
            let childPrefix: string;
            let childIndent: string;
            if (i + 1 < this.children.length) {
                childPrefix = indent + "├── ";
                childIndent = indent + "│   ";
            }
            else {
                childPrefix = indent + "└── ";
                childIndent = indent + "    ";
            }
            const child = this.children[i];
            child.write(writer, childPrefix, childIndent, options);
        }
    }

    public treeToString(options?: WriteOptions): string {
        options = options || {};
        const lines: string[] = [];
        const writer: CellWriter = {
            println(msg: string): void {
                lines.push(msg);
            }
        };
        this.write(writer, "", "", options);
        return lines.join("\n");
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

    public constructor(value: Value) {
        super(null, value);
    }

    public get name(): string {
        return "SimpleCell " + (<any> this.value).constructor.name;
    }
}

export class ConstantCell extends Cell {
    public readonly _class_ConstantCell: any;
    public readonly kind: "constant" = "constant";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class TryCell extends Cell {
    public readonly _class_extends: any;
    public readonly kind: "try" = "try";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class ThrowCell extends Cell {
    public readonly _class_ThrowCell: any;
    public readonly kind: "throw" = "throw";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class SetCell extends Cell {
    public readonly _class_AssignCell: any;
    public readonly kind: "set" = "set";

    public constructor(parent: Cell | null) {
        super(parent);
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

    public constructor(parent: Cell | null, variable: Variable, cell: Cell) {
        super(parent);
        this.variable = variable;
        this.cell = cell;
    }

    public get name(): string {
        return "write " + this.variable.slot.name;
    }
}

export class IfCell extends Cell {
    public readonly _class_extends: any;
    public readonly kind: "if" = "if";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class LambdaCell extends Cell {
    public readonly _class_LambdaCell: any;
    public readonly kind: "lambda" = "lambda";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class SequenceCell extends Cell {
    public readonly _class_SequenceCell: any;
    public readonly kind: "sequence" = "sequence";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class ApplyCell extends Cell {
    public readonly _class_ApplyCell: any;
    public readonly kind: "apply" = "apply";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class ReadCell extends Cell {
    public readonly _class_VariableCell: any;
    public readonly kind: "read" = "read";
    public readonly variable: Variable;

    public constructor(parent: Cell | null, variable: Variable) {
        super(parent);
        this.variable = variable;
    }

    public get name(): string {
        return "read " + this.variable.slot.name;
    }
}

export class LetrecCell extends Cell {
    public readonly _class_LetrecCell: any;
    public readonly kind: "letrec" = "letrec";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class InputCell extends Cell {
    public readonly _class_InputCell: any;
    public readonly kind: "input" = "input";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export function evalTracing(node: ASTNode, env: Environment, parent: Cell | null): Cell {
    switch (node.kind) {
        case "constant": {
            const cell = new ConstantCell(parent);
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
            const cell = new SetCell(parent);

            const valueCell = evalTracing(node.body, env, cell);
            // const value = valueCell.value;
            // variable.value = value;
            variable.cell = valueCell;
            new WriteCell(cell, variable, valueCell);
            return cell;
        }
        case "if": {
            const cell = new IfCell(parent);
            const condValueCell = evalTracing(node.condition, env, cell);
            const condValue = condValueCell.value;
            if (condValue.isTrue()) {
                const branchCell = evalTracing(node.consequent, env, cell);
                const branchValue = branchCell.value;
                cell.value = branchValue;
            }
            else {
                const branchCell = evalTracing(node.alternative, env, cell);
                const branchValue = branchCell.value;
                cell.value = branchValue;
            }
            return cell;
        }
        case "lambda": {
            const cell = new LambdaCell(parent);
            cell.value = new LambdaProcedureValue(env, node);
            return cell;
        }
        case "sequence": {
            let cell: Cell;
            // if ((parent !== null) && (parent instanceof SequenceCell))
            //     cell = parent;
            // else
                cell = new SequenceCell(parent);
            // const cell = new SequenceCell(parent);
            const ignoreCell = evalTracing(node.body, env, cell);
            void ignoreCell;
            const resultCell = evalTracing(node.next, env, cell);
            const resultValue = resultCell.value;
            cell.value = resultValue;
            return cell;
        }
        case "apply": {
            const cell = new ApplyCell(parent);
            const procCell = evalTracing(node.proc, env, cell);
            const procValue = procCell.value;
            const argArray: Value[] = [];
            for (let i = 0; i < node.args.length; i++) {
                const arg = node.args[i];
                const argCell = evalTracing(arg, env, cell);
                const argValue = argCell.value;
                argArray.push(argValue);
            }

            if (procValue instanceof BuiltinProcedureValue) {
                const resultValue = procValue.direct(argArray);
                cell.value = resultValue;
            }
            else if (procValue instanceof LambdaProcedureValue) {
                const resultCell = evalLambdaTracing(procValue, argArray, node.range, cell);
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
            // const cell = new ReadCell(parent, variable);
            const valueCell = variable.cell;
            if (valueCell === undefined)
                throw new Error("Variable " + variable.slot.name + " does not have a cell");
            // const value = variable.value;
            // const value = valueCell.value;
            // cell.value = value;
            // return cell;
            new ReadCell(parent, variable);
            return valueCell;
        }
        case "letrec": {
            const cell = new LetrecCell(parent);
            const innerEnv = new Environment(node.innerScope, env);
            // const bindingArray: Value[] = [];
            const cellArray: Cell[] = [];
            for (const binding of node.bindings) {
                const varCell = evalTracing(binding.body, innerEnv, cell);
                cellArray.push(varCell);
                // const varValue = varCell.value;
                // bindingArray.push(varValue);
            }
            // innerEnv.setVariableValues(bindingArray);
            innerEnv.setVariableCells(cellArray);
            const bodyCell = evalTracing(node.body, innerEnv, cell);
            const bodyValue = bodyCell.value;
            cell.value = bodyValue;
            return cell;
        }
        case "input": {
            const cell = new InputCell(parent);
            const inputDataflowNode = getInput(node.name);
            cell.value = inputDataflowNode.value;
            return cell;
        }
    }
}

export function evalLambdaTracing(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange, parent: Cell): Cell {
    const outerEnv = procValue.env;
    const lambdaNode = procValue.proc;
    const cell = new LambdaCell(parent);

    const expectedArgCount = lambdaNode.variables.length;
    const actualArgCount = argArray.length;
    if (actualArgCount !== expectedArgCount) {
        const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
        const error = new BuildError(range, msg);
        throw new SchemeException(new ErrorValue(error));
    }

    const innerEnv = new Environment(lambdaNode.innerScope, outerEnv, argArray);
    const bodyCell = evalTracing(procValue.proc.body, innerEnv, cell);
    const bodyValue = bodyCell.value;
    cell.value = bodyValue;
    return cell;
}
