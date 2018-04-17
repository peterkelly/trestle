import * as blessed from "blessed";

// Create a screen object.
const screen = blessed.screen({
  smartCSR: true
});

let frame = 0;

const box = blessed.box({
    top: "center",
    left: "center",
    width: "50%",
    height: "50%",
    content: "Hello {bold}world{/bold}!",
    tags: true,
    // border: {
    //     type: "line"
    // },
    style: {
        fg: "blue",
        bg: "white",
        border: {
            fg: "#f0f0f0"
        },
        hover: {
            bg: "green"
        }
    }
});

const line1 = blessed.text({
    content: "This is a test! with lots of characters...",
    top: 2,
    left: 2,
    width: 30,
    height: 1,
    style: {
        fg: "black",
        bg: "white",
    }
});
box.append(line1);

screen.append(box);

screen.render();

// Quit on Escape, q, or Control-C.
screen.key(["escape", "q", "C-c"], (ch, key) => {
    return process.exit(0);
});

screen.key(["["], (ch, key) => {
    frame--;
    line1.setContent("Frame " + frame);
    screen.render();
});

screen.key(["]"], (ch, key) => {
    frame++;
    line1.setContent("Frame " + frame);
    screen.render();
});
