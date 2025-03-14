'use strict';

// to run test, run command `node <test_file_name>.js`
// Running basic tests to check installation was done properly
const Iroh = require('iroh');
// Log variables
let code = 'let check = true';
let stage = new Iroh.Stage(code);
const listener = stage.addListener(Iroh.VAR);
listener.on('after', (e) => {
	// this logs the variable's 'name' and 'value'
	console.log(e.name, '=>', e.value); // prints "check => true"
});

// Manipulate functions
function modified() {
	return false;
}

stage = new Iroh.Stage(modified.toString());
stage.addListener(Iroh.FUNCTION).on('return', (e) => {
	if (e.name === 'modified') e.return = true;
});
console.log('before (should be false)');
console.log(modified());
console.log('after (should be true)');
console.log(modified());
// visualize code
code = `
	if (true) {
		for (let i = 0; i < 3; ++i) {
			let a = i * 2;
		}
	}
`;

stage = new Iroh.Stage(code);
// while, for etc.
stage
	.addListener(Iroh.LOOP)
	.on('enter', (e) => {
		// when we enter the loop
		console.log(`${' '.repeat(e.indent)}loop enter'`);
	})
	.on('leave', (e) => {
		// when we leave the loop
		console.log(`${' '.repeat(e.indent)}loop leave'`);
	});

// if, else if
stage
	.addListener(Iroh.IF)
	.on('enter', (e) => {
		// when we enter the if
		console.log(`${' '.repeat(e.indent)}if enter'`);
	})
	.on('leave', (e) => {
		// when we leave the if
		console.log(`${' '.repeat(e.indent)}if leave'`);
	});

if (stage.script) {
	// eslint-disable-next-line no-eval
	eval(stage.script);
}
