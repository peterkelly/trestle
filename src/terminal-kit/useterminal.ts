import * as terminalkit from "terminal-kit";

// const foo = terminalkit;

// foo.createTerminal();

for (const key of Object.keys(terminalkit).sort()) {
    // console.log(key.padEnd(30) + " " + typeof((<any> terminalkit)[key]));
    console.log(key);
}


console.log("==== Button", terminalkit.Button);
console.log("==== ColumnMenu", terminalkit.ColumnMenu);
console.log("==== Container", terminalkit.Container);
console.log("==== Document", terminalkit.Document);
console.log("==== DropDownMenu", terminalkit.DropDownMenu);
console.log("==== Element", terminalkit.Element);
console.log("==== Form", terminalkit.Form);
console.log("==== Layout", terminalkit.Layout);
console.log("==== Rect", terminalkit.Rect);
console.log("==== RowMenu", terminalkit.RowMenu);
console.log("==== ScreenBuffer", terminalkit.ScreenBuffer);
console.log("==== ScreenBufferHD", terminalkit.ScreenBufferHD);
console.log("==== Terminal", terminalkit.Terminal);
console.log("==== Text", terminalkit.Text);
console.log("==== TextBuffer", terminalkit.TextBuffer);
console.log("==== TextInput", terminalkit.TextInput);
console.log("==== autoComplete", terminalkit.autoComplete);
console.log("==== color2index", terminalkit.color2index);
console.log("==== colorNameToIndex", terminalkit.colorNameToIndex);
console.log("==== createTerminal", terminalkit.createTerminal);
console.log("==== getDetectedTerminal", terminalkit.getDetectedTerminal);
console.log("==== getParentTerminalInfo", terminalkit.getParentTerminalInfo);
console.log("==== globalConfig", terminalkit.globalConfig);
console.log("==== guessTerminal", terminalkit.guessTerminal);
console.log("==== hexToColor", terminalkit.hexToColor);
console.log("==== hexToRgba", terminalkit.hexToRgba);
console.log("==== image", terminalkit.image);
console.log("==== index2color", terminalkit.index2color);
console.log("==== indexToColorName", terminalkit.indexToColorName);
console.log("==== spChars", terminalkit.spChars);
console.log("==== stringWidth", terminalkit.stringWidth);
console.log("==== stripControlChars", terminalkit.stripControlChars);
console.log("==== stripEscapeSequences", terminalkit.stripEscapeSequences);
console.log("==== truncateString", terminalkit.truncateString);
console.log("==== tty", terminalkit.tty);




// console.log("==== realTerminal");
// console.log(terminalkit.realTerminal);
// console.log("==== terminal");
// console.log(terminalkit.terminal);
