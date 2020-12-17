const { src, dest } = require("gulp");
const eslint = require("gulp-eslint");
const exec = require('child_process').exec;

function runTests(cb) {
    exec('mocha -r ts-node/register ./tests/app.test.ts', function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    });
}

function runLinter(cb) {
    return src(['**/*.js', '**/*.ts', '*.js', '*.ts', '!node_modules/**', '!dist/**', '!bin/**', '!app.js'])
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError())
        .on('end', () => {
            console.log("Found no errors or warnings:\u001b[32m passed\u001b[0m");
            cb();
        });
}

exports.lint = runLinter;
exports.test = runTests;

exports.default = runLinter
