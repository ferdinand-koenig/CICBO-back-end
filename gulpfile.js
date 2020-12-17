const secretSchema = require("./schema/secret.json");

const { src, dest, series } = require("gulp");
const eslint = require("gulp-eslint");
const exec = require('child_process').exec;
const uglify = require("gulp-uglify");
const fs = require("fs");
const validate = require('jsonschema').validate;

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
        if(!err) console.log("\u001b[32m √\u001b[0m TypeScript compiled");
        cb(err);
    });
}
function runLinter(cb) {
    return src(['**/*.js', '**/*.ts', '*.js', '*.ts', '!node_modules/**', '!dist/**', '!bin/**', '!app.js', '!public'])
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError())
        .on('end', () => {
            console.log(" ");
            console.log("\u001b[32m √\u001b[0m Found no errors or warnings:\u001b[32m passed\u001b[0m");
            cb();
        });
}
function minifyJS(cb) {
    src(['./app.js'])
        .pipe(uglify())
        .pipe(dest('./', {overwrite: true}))
    console.log(" ");
    console.log("\u001b[32m √\u001b[0m app.js minified")
    cb();
}
function checkPrototypeSecretsJSON(cb){
    if (fs.existsSync('./secrets/mongo-settings-with-credentials.json')) {
        if(validate(JSON.parse(fs.readFileSync("./secrets/mongo-settings-with-credentials.json")), secretSchema, {required: true}).valid){
            cb();
        }else
            cb(new Error("\u001b[31m X\u001b[0m Secrets-file not valid (./secrets/mongo-settings-with-credentials.json)!"));
    }else
        cb(new Error("\u001b[31m X\u001b[0m Secrets-file not found (./secrets/mongo-settings-with-credentials.json)!"));
}
function start(cb){
    console.log("\u001b[32m √\u001b[0m listening on port 3000");
    exec('node ./bin/www', function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    });
}

const build = series(runLinter, compileTypeScript, minifyJS, checkPrototypeSecretsJSON, runTests);

exports.lint = runLinter;
exports.test = runTests;
exports.compile = compileTypeScript;
exports.min = minifyJS;
exports.build = build;
exports.start = series(checkPrototypeSecretsJSON, start);

exports.default = series(build, start);
