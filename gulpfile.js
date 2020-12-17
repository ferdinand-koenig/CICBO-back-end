const { src, dest } = require("gulp");
const eslint = require("gulp-eslint");
const exec = require('child_process').exec;
const minify = require("gulp-minify");

function runTests(cb) {
    exec('mocha -r ts-node/register ./tests/app.test.ts', function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    });
}
function compileTypeScript(cb) {
    exec('tsc --build ./tsconfig.json', function (err, stdout, stderr) {
        console.log(stderr);
        if(!err) console.log("\u001b[32m √\u001b[0m TypeScript compiled")
        cb(err);
    });
}
function runLinter(cb) {
    return src(['**/*.js', '**/*.ts', '*.js', '*.ts', '!node_modules/**', '!dist/**', '!bin/**', '!app.js', '!public'])
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError())
        .on('end', () => {
            console.log("\u001b[32m √\u001b[0m Found no errors or warnings:\u001b[32m passed\u001b[0m");
            cb();
        });
}
function minifyJS(cb) {
    src('./app.js', { allowEmpty: false })
        .pipe(minify({noSource: true}))
        .pipe(dest('public/js'));
    src('./bin/www', { allowEmpty: false })
        .pipe(minify())
        .pipe(dest('public/js'));
    cb();
}
function createPrototypeSecretsJSON(cb){
    cb();
}
function pushToProduction(cb){
    cb();
}

exports.lint = runLinter;
exports.test = runTests;
exports.compile = compileTypeScript;
exports.min = minifyJS;

exports.default = runLinter;
