#! /usr/bin/env node

require('jsdom-global')(undefined, { url: 'https://localhost' });

// Node 21+ has a native navigator that jsdom-global keeps, reporting the host platform (MacIntel on macOS)
Object.defineProperty(global, 'navigator', { configurable: true, writable: true, value: window.navigator });

global.root = document.createElement('div');
global.root.style.width = '100%';
global.root.style.height = '100%';
global.root.innerHTML = '';
document.body.appendChild(global.root);

exports.mochaHooks = {
    afterEach(done) {
        // destroy datagrid component
        global.root.innerHTML = '';
        done();
    },
};
