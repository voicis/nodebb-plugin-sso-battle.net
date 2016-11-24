module.exports = function (wallaby) {
    return {
        files: [
            // PhantomJs Function.bind polyfill
            { pattern: 'node_modules/phantomjs-polyfill/bind-polyfill.js', instrument: false },
            // ES6 promise polyfill
            { pattern: 'node_modules/es6-promise/dist/es6-promise.js', instrument: false },

            { pattern: 'node_modules/chai/chai.js', instrument: false },
            { pattern: 'node_modules/chai-as-promised/lib/chai-as-promised.js', instrument: false },
            { pattern: 'library.js' }
        ],

        tests: [
            { pattern: 'test/**/*.spec.js' }
        ],

        testFramework: "mocha",

        setup: function () {
            window.expect = chai.expect;
            var should = chai.should();
        },
        env: {
            type: 'node'
            // More options are described here
            // http://wallabyjs.com/docs/integration/node.html
        }
    };
};