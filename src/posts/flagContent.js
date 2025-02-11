'use strict';

// List of banned words (in hex)
const BANNED_WORDS = ['\x66\x75\x63\x6b', '\x73\x68\x69\x74', '\x61\x73\x73', '\x62\x69\x74\x63\x68', '\x63\x75\x6e\x74', '\x70\x75\x73\x73\x79', '\x6e\x69\x67\x67\x65\x72'];

// Splits a content string and checks if any of the words in it are in the banned words list
module.exports = function flagContent(content) {
	const words = content.toLowerCase().split(' ');
	return words.some(x => BANNED_WORDS.includes(x));
};
