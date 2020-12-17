const secretSchema = require("./schema/secret.json");

const { src, dest, series } = require("gulp");
const eslint = require("gulp-eslint");
const uglify = require("gulp-uglify");
const typedoc = require("gulp-typedoc");
const exec = require('child_process').exec;
const fs = require("fs");
const validate = require('jsonschema').validate;

function runTests(cb) {
    exec('mocha -r ts-node/register ./tests/app.test.ts', function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        if(!err) console.log("\u001b[32m V\u001b[0m All tests passed");
        cb(err);
    });
}
function compileTypeScript(cb) {
    exec('tsc --build ./tsconfig.json', function (err, stdout, stderr) {
        console.log(stderr);
        if(!err) console.log("\u001b[32m V\u001b[0m TypeScript compiled");
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
            console.log("\u001b[32m V\u001b[0m Found no errors or warnings:\u001b[32m passed\u001b[0m");
            cb();
        });
}
function minifyJS(cb) {
    src(['./app.js'])
        .pipe(uglify())
        .pipe(dest('./', {overwrite: true}))
    console.log(" ");
    console.log("\u001b[32m V\u001b[0m app.js minified")
    cb();
}
function checkForSecretsJSON(cb){
    if (fs.existsSync('./secrets/mongo-settings-with-credentials.json')) {
        if(validate(JSON.parse(fs.readFileSync("./secrets/mongo-settings-with-credentials.json")), secretSchema, {required: true}).valid){
            console.log("\n\u001b[32m V\u001b[0m Secrets-file is valid")
            cb();
        }else
            cb(new Error("\u001b[31m X\u001b[0m Secrets-file not valid (./secrets/mongo-settings-with-credentials.json)!"));
    }else
        cb(new Error("\u001b[31m X\u001b[0m Secrets-file not found (./secrets/mongo-settings-with-credentials.json)!"));
}
function start(cb){
    console.log("\u001b[32m V\u001b[0m listening on port 3000");
    exec('node ./bin/www', function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    });
}
function createDocumentation() {
    return src(["./app.ts"])
        .pipe(typedoc({
            // TypeScript options (see typescript docs)
            module: "commonjs",
            target: "es5",
            includeDeclarations: true,

            // Output options (see typedoc docs)
            out: "./documentation",
            json: "./documentation/project.json",

            // TypeDoc options (see typedoc docs)
            name: "CICBO-back-end",
            theme: "default",
            exclude: "**/node_modules/**",
            ignoreCompilerErrors: false,
            version: true,
        }).on('end', ()=>{console.log("\n\u001b[32m V\u001b[0m Documentation created in './documentation/': open index.html in browser")}));
}

const build = series(runLinter, checkForSecretsJSON, compileTypeScript, minifyJS, runTests);

exports.lint = runLinter;
exports.test = runTests;
exports.compile = series(checkForSecretsJSON,compileTypeScript);
exports.min = minifyJS;
exports.build = build;
exports.start = series(checkForSecretsJSON, start);
exports.doc = createDocumentation;

exports.default = series(build, createDocumentation, start);
