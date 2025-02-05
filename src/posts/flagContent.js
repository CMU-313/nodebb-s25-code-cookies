'use strict';

// List of banned words
const BANNED_WORDS = ["ryan"];

// Splits a content string and checks if any of the words in it are in the banned words list
module.exports = function flagContent(content) {
    let words = content.toLowerCase().split(" ");
    return words.some(x => BANNED_WORDS.includes(x));
};