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
    SExpr,
    BooleanExpr,
    NumberExpr,
    StringExpr,
    SymbolExpr,
    QuoteExpr,
    PairExpr,
    NilExpr,
} from "./sexpr";
import {
    SourceLocation,
    SourceRange,
    TextBuffer,
    Cursor,
} from "./source";

function isDigitChar(c: string): boolean {
    return ((c.length === 1) && (c >= "0") && (c <= "9"));
}

function isWhitespaceChar(c: string): boolean {
    switch (c) {
        case " ":
        case "\t":
        case "\r":
        case "\n":
            return true;
        default:
            return false;
    }
}

function isSymbolChar(c: string): boolean {
    switch (c) {
        case "\"":
        case "'":
        case "(":
        case ")":
        case "#":
        case " ":
        case ";":
        case "\t":
        case "\r":
        case "\n":
            return false;
        default:
            return true;
    }
}

class ParseError extends Error {
    public readonly location: SourceLocation;
    public readonly detail: string;
    public constructor(location: SourceLocation, detail: string) {
        super(location + ": " + detail);
        this.location = location;
        this.detail = detail;
    }
}

export class Parser {
    public readonly buf: TextBuffer;
    public csr: Cursor;

    public constructor(input: string) {
        this.buf = new TextBuffer(input);
        this.csr = this.buf.createCursor();
    }

    public matchChar(c: string): boolean {
        if (!this.csr.atEnd() && (this.csr.current() === c)) {
            this.csr.advance();
            return true;
        }
        else {
            return false;
        }
    }

    public matchRange(min: string, max: string): boolean {
        if (!this.csr.atEnd() && (this.csr.current() >= min) && (this.csr.current() <= max)) {
            this.csr.advance();
            return true;
        }
        else {
            return false;
        }
    }

    public skipRestOfLine(): void {
        while (!this.matchChar("\n"))
            this.csr.advance();
        this.matchChar("\n");
    }

    public skipWhitespace(): void {
        while (!this.csr.atEnd()) {
            if (this.csr.current() === ";")
                this.skipRestOfLine();
            else if (isWhitespaceChar(this.csr.current()))
                this.csr.advance();
            else
                break;
        }
    }

    public parseNumber(): NumberExpr {
        const startLoc = this.csr.saveLocation();
        while (this.matchRange("0", "9")) {
            // repeat
        }
        if (this.matchChar(".")) {
            let decimalDigits = 0;
            while (this.matchRange("0", "9")) {
                // repeat
                decimalDigits++;
            }
            if (decimalDigits === 0) {
                const range = this.csr.getRangeFrom(startLoc);
                throw new ParseError(this.csr.saveLocation(), "Malformed number: " + this.buf.textInRange(range));
            }
        }
        const range = this.csr.getRangeFrom(startLoc);
        const str = this.buf.textInRange(range);
        const num = parseFloat(str);
        return new NumberExpr(range, num);
    }

    public parseString(): StringExpr {
        const start = this.csr.saveLocation();
        if (!this.matchChar("\""))
            throw new ParseError(this.csr.saveLocation(), "Expected \"");
        let value = "";
        while (!this.csr.atEnd()) {
            if (this.matchChar("\\")) {
                if (this.csr.atEnd())
                    throw new ParseError(this.csr.saveLocation(), "Unexpected end of input");
                switch (this.csr.current()) {
                    case "n":
                        value += "\n";
                        break;
                    case "r":
                        value += "\r";
                        break;
                    case "t":
                        value += "\t";
                        break;
                    case "\\":
                        value += "\\";
                        break;
                    default:
                        value += this.csr.current();
                        break;
                }
            }
            else if (this.matchChar("\"")) {
                const range = this.csr.getRangeFrom(start);
                return new StringExpr(range, value);
            }
            else {
                value += this.csr.current();
            }
            this.csr.advance();
        }
        throw new ParseError(this.csr.saveLocation(), "Unexpected end of input");
    }

    public parseSymbol(): SymbolExpr {
        const start = this.csr.saveLocation();
        while (!this.csr.atEnd() && isSymbolChar(this.csr.current()))
            this.csr.advance();
        const range = this.csr.getRangeFrom(start);
        const name = this.buf.textInRange(range);
        return new SymbolExpr(range, name);
    }

    public parseQuote(): QuoteExpr {
        const start = this.csr.saveLocation();
        if (!this.matchChar("'"))
            throw new ParseError(this.csr.saveLocation(), "Expected '");
        const body = this.parseExpression();
        const range = this.csr.getRangeFrom(start);
        return new QuoteExpr(range, body);
    }

    public parseList(): PairExpr | NilExpr {
        const listStart = this.csr.saveLocation();
        const items: SExpr[] = [];
        if (!this.matchChar("("))
            throw new ParseError(this.csr.saveLocation(), "Expected (");
        this.skipWhitespace();
        let endLoc = this.csr.saveLocation();
        while (true) {
            if (this.csr.atEnd())
                throw new ParseError(this.csr.saveLocation(), "Unexpected end of input");
            endLoc = this.csr.saveLocation();
            if (this.matchChar(")"))
                break;
            items.push(this.parseExpression());
            this.skipWhitespace();
        }

        const endRange = this.csr.getRangeFrom(endLoc);
        const terminator = new NilExpr(endRange);

        const listEnd = this.csr.saveLocation();
        const listRange = new SourceRange(listStart, listEnd);
        return sexprArrayToList(items, listRange, terminator);
    }

    public parseHash(): SExpr {
        const start = this.csr.saveLocation();
        if (!this.matchChar("#"))
            throw new ParseError(start, "Expected #");
        if (this.matchChar("t")) {
            const range = this.csr.getRangeFrom(start);
            return new BooleanExpr(range, true);
        }
        else if (this.matchChar("f")) {
            const range = this.csr.getRangeFrom(start);
            return new BooleanExpr(range, false);
        }
        else if (!this.csr.atEnd()) {
            throw new ParseError(start, "Unexpected input: #" + this.csr.current());
        }
        else {
            throw new ParseError(this.csr.saveLocation(), "Unexpected end of input");
        }
    }

    public parseExpression(): SExpr {
        if (this.csr.atEnd())
            throw new ParseError(this.csr.saveLocation(), "Unexpected end of input");
        if (isDigitChar(this.csr.current()))
            return this.parseNumber();
        else if (this.csr.current() === "\"")
            return this.parseString();
        else if (isSymbolChar(this.csr.current()))
            return this.parseSymbol();
        else if (this.csr.current() === "'")
            return this.parseQuote();
        else if (this.csr.current() === "(")
            return this.parseList();
        else if (this.csr.current() === "#")
            return this.parseHash();
        else
            throw new ParseError(this.csr.saveLocation(), "Unexpected character: " + this.csr.current());
    }

    public parseTopLevel(): PairExpr | NilExpr {
        const items: SExpr[] = [];
        this.skipWhitespace();
        while (!this.csr.atEnd()) {
            items.push(this.parseExpression());
            this.skipWhitespace();
        }

        const listStart = new SourceLocation(0);
        const listEnd = this.csr.saveLocation();
        const endRange = new SourceRange(listStart.clone(), listEnd.clone());
        const terminator = new NilExpr(endRange);
        const listRange = new SourceRange(listStart, listEnd);
        return sexprArrayToList(items, listRange, terminator);

        // return items;
    }
}

function sexprArrayToList(items: SExpr[], listRange: SourceRange, terminator: NilExpr): PairExpr | NilExpr {
    const listStart = listRange.start;
    const listEnd = listRange.end;
    let result: PairExpr | NilExpr = terminator;
    for (let i = items.length - 1; i >= 0; i--) {
        const itemStart = (i === 0) ? listStart : items[i].range.start;
        const itemRange = new SourceRange(itemStart.clone(), listEnd.clone());
        result = new PairExpr(itemRange, items[i], result);
    }
    return result;
}
