import { ASTNode, LambdaProcedureValue } from "./ast";
import { BuildError } from "./sexpr";
import { SourceRange } from "./source";
import { Value, ErrorValue, UnspecifiedValue } from "./value";
import { Variable, Environment, SchemeException } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";
import { getInput } from "./dataflow";

export interface ReadItem {
    kind: "read";
    variable: Variable;
}

export interface WriteIem {
    kind: "write";
    variable: Variable;
}

export interface CellItem {
    kind: "cell";
    cell: Cell;
}

export interface CellWriter {
    println(msg: string): void;
}

export type TraceItem = ReadItem | WriteIem | CellItem;

export abstract class Cell {
    public readonly _class_Cell: any;
    public value: Value;
    public items: TraceItem[] = [];
    public abstract name: string;
    public readonly parent: Cell | null;

    public constructor(parent: Cell | null, value?: Value) {
        this.parent = parent;
        if (this.parent !== null)
            this.parent.items.push({
                kind: "cell",
                cell: this,
            });
        if (value !== undefined)
            this.value = value;
        else
            this.value = UnspecifiedValue.instance;
    }

    public write(writer: CellWriter, prefix: string, indent: string): void {
        writer.println(prefix + this.name);
        for (let i = 0; i < this.items.length; i++) {
            let childPrefix: string;
            let childIndent: string;
            if (i + 1 < this.items.length) {
                childPrefix = indent + "├─ ";
                childIndent = indent + "│   ";
            }
            else {
                childPrefix = indent + "└── ";
                childIndent = indent + "    ";
            }
            const item = this.items[i];
            switch (item.kind) {
                case "read":
                    writer.println(childPrefix + " read " + item.variable.slot.name);
                    break;
                case "write":
                    writer.println(childPrefix + " write " + item.variable.slot.name);
                    break;
                case "cell":
                    item.cell.write(writer, childPrefix, childIndent);
                    break;
            }
        }
    }

    public dump(): void {
        const writer: CellWriter = {
            println: (msg: string): void => console.log(msg),
        };
        this.write(writer, "", "");
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
    public readonly kind: "ext" = "ext";

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

export class AssignCell extends Cell {
    public readonly _class_AssignCell: any;
    public readonly kind: "assign" = "assign";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
    }
}

export class IfCell extends Cell {
    public readonly _class_extends: any;
    public readonly kind: "ext" = "ext";

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

export class VariableCell extends Cell {
    public readonly _class_VariableCell: any;
    public readonly kind: "variable" = "variable";

    public constructor(parent: Cell | null) {
        super(parent);
    }

    public get name(): string {
        return this.kind;
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
            const cell = new AssignCell(parent);

            const valueCell = evalTracing(node.body, env, cell);
            const value = valueCell.value;
            const variable = env.resolveRef(node.ref, node.range);
            variable.value = value;
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
            const cell = new SequenceCell(parent);
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
            const cell = new VariableCell(parent);
            const variable = env.resolveRef(node.ref, node.range);
            const value = variable.value;
            cell.value = value;
            return cell;
        }
        case "letrec": {
            const cell = new LetrecCell(parent);
            const innerEnv = new Environment(node.innerScope, env);
            const bindingArray: Value[] = [];
            for (const binding of node.bindings) {
                const varCell = evalTracing(binding.body, innerEnv, cell);
                const varValue = varCell.value;
                bindingArray.push(varValue);
            }
            innerEnv.setVariableValues(bindingArray);
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
