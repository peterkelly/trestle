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
    cell: SimpleCell;
}

export interface CellWriter {
    println(msg: string): void;
}

export type TraceItem = ReadItem | WriteIem | CellItem;

export abstract class Cell {
    public readonly _class_Cell: any;
    public value: Value;
    public items: TraceItem[] = [];

    public constructor(value?: Value) {
        if (value !== undefined)
            this.value = value;
        else
            this.value = UnspecifiedValue.instance;
    }

    public write(writer: CellWriter, prefix: string, indent: string): void {
        writer.println(prefix + (<any> this.value).constructor.name);
        for (let i = 0; i < this.items.length; i++) {
            let childPrefix: string;
            let childIndent: string;
            if (i + 1 < this.items.length) {
                childPrefix = "|-- ";
                childIndent = "|   ";
            }
            else {
                childPrefix = "\-- ";
                childIndent = "    ";
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
        super(value);
    }
}

export function evalTracing(node: ASTNode, env: Environment): SimpleCell {
    switch (node.kind) {
        case "constant": {
            return new SimpleCell(node.value.toValue());
        }
        case "try": {
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        }
        case "throw": {
            throw new Error("Exceptions are not supported in tracing evaluation mode");
        }
        case "assign": {
            const valueCell = evalTracing(node.body, env);
            const value = valueCell.value;
            const variable = env.resolveRef(node.ref, node.range);
            variable.value = value;
            return new SimpleCell(UnspecifiedValue.instance);
        }
        case "if": {
            const condValueCell = evalTracing(node.condition, env);
            const condValue = condValueCell.value;
            if (condValue.isTrue()) {
                const branchCell = evalTracing(node.consequent, env);
                const branchValue = branchCell.value;
                return new SimpleCell(branchValue);
            }
            else {
                const branchCell = evalTracing(node.alternative, env);
                const branchValue = branchCell.value;
                return new SimpleCell(branchValue);
            }
        }
        case "lambda": {
            const result = new LambdaProcedureValue(env, node);
            return new SimpleCell(result);
        }
        case "sequence": {
            const ignoreCell = evalTracing(node.body, env);
            void ignoreCell;
            const resultCell = evalTracing(node.next, env);
            const resultValue = resultCell.value;
            return new SimpleCell(resultValue);
        }
        case "apply": {
            const procCell = evalTracing(node.proc, env);
            const procValue = procCell.value;
            const argArray: Value[] = [];
            for (let i = 0; i < node.args.length; i++) {
                const arg = node.args[i];
                const argCell = evalTracing(arg, env);
                const argValue = argCell.value;
                argArray.push(argValue);
            }

            if (procValue instanceof BuiltinProcedureValue) {
                const resultValue = procValue.direct(argArray);
                return new SimpleCell(resultValue);
            }
            else if (procValue instanceof LambdaProcedureValue) {
                const resultCell = evalLambdaTracing(procValue, argArray, node.range);
                const resultValue = resultCell.value;
                return new SimpleCell(resultValue);
            }
            else {
                const msg = "Cannot apply " + procValue;
                const error = new BuildError(node.range, msg);
                throw new SchemeException(new ErrorValue(error));
            }
        }
        case "variable": {
            const variable = env.resolveRef(node.ref, node.range);
            const value = variable.value;
            return new SimpleCell(value);
        }
        case "letrec": {
            const innerEnv = new Environment(node.innerScope, env);
            const bindingArray: Value[] = [];
            for (const binding of node.bindings) {
                const varCell = evalTracing(binding.body, innerEnv);
                const varValue = varCell.value;
                bindingArray.push(varValue);
            }
            innerEnv.setVariableValues(bindingArray);
            const bodyCell = evalTracing(node.body, innerEnv);
            const bodyValue = bodyCell.value;
            return new SimpleCell(bodyValue);
        }
        case "input": {
            const inputDataflowNode = getInput(node.name);
            return new SimpleCell(inputDataflowNode.value);
        }
    }
}

export function evalLambdaTracing(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange): SimpleCell {
    const outerEnv = procValue.env;
    const lambdaNode = procValue.proc;

    const expectedArgCount = lambdaNode.variables.length;
    const actualArgCount = argArray.length;
    if (actualArgCount !== expectedArgCount) {
        const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
        const error = new BuildError(range, msg);
        throw new SchemeException(new ErrorValue(error));
    }

    const innerEnv = new Environment(lambdaNode.innerScope, outerEnv, argArray);
    return evalTracing(procValue.proc.body, innerEnv);
}
