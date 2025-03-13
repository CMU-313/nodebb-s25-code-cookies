'use strict';

// Custom require function to prevent modifying require.main
function customRequire(path) {
    return require(path);
}

// Export it so other files can use it
module.exports = customRequire;
