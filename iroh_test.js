//Set Up
//to install, run `npm install Iroh`
//if missing dependency, run `npm install babael`

// Running basic tests to check installation was done properly
const Iroh = require('Iroh');
// Log variables
let code = `let check = true`;
let stage = new Iroh.Stage(code);
let listener = stage.addListener(Iroh.VAR);
listener.on("after", (e) => {
  // this logs the variable's 'name' and 'value'
  console.log(e.name, "=>", e.value); // prints "check => true"
});
eval(stage.script);

// Manipulate functions
function modified() {
    return false;
  };
  
stage = new Iroh.Stage(modified.toString());
stage.addListener(Iroh.FUNCTION).on("return", function(e) {
if (e.name === "modified") e.return = true;
});

console.log("before (should be false)");
console.log(modified());
eval(stage.script);
console.log("after (should be true)");
console.log(modified());

//visualize code
code = `
  if (true) {
    for (i = 0; i < 3; ++i) {
      let a = i * 2;
    };
  }
`

stage = new Iroh.Stage(code)

// while, for etc.
stage
  .addListener(Iroh.LOOP)
  .on("enter", function (e) {
    // when we enter the loop
    console.log(" ".repeat(e.indent) + "loop enter")
  })
  .on("leave", function (e) {
    // when we leave the loop
    console.log(" ".repeat(e.indent) + "loop leave")
  })

// if, else if
stage
  .addListener(Iroh.IF)
  .on("enter", function (e) {
    // when we enter the if
    console.log(" ".repeat(e.indent) + "if enter")
  })
  .on("leave", function (e) {
    // when we leave the if
    console.log(" ".repeat(e.indent) + "if leave")
  })

eval(stage.script)
