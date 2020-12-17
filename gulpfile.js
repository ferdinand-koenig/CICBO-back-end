const secretSchema = require("./schema/secret.json");

const { src, dest, series } = require("gulp");
const eslint = require("gulp-eslint");
const uglify = require("gulp-uglify");
const typedoc = require("gulp-typedoc");
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const fs = require("fs");
const validate = require('jsonschema').validate;

function runTests(cb) {
    exec('npx mocha -r ts-node/register ./tests/app.test.ts', function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        if(!err) console.log("\u001b[32m [V] All tests passed\u001b[0m");
        cb(err);
    });
}
function compileTypeScript(cb) {
    exec('tsc --build ./tsconfig.json', function (err, stdout, stderr) {
        console.log(stderr);
        if(!err) console.log("\u001b[32m [V] TypeScript compiled\u001b[0m");
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
            console.log("\u001b[32m [V] Found no errors or warnings: passed\u001b[0m");
            cb();
        });
}
function minifyJS(cb) {
    src(['./app.js'])
        .pipe(uglify())
        .pipe(dest('./', {overwrite: true}))
    console.log("\n\u001b[32m [V] app.js minified\u001b[0m")
    cb();
}
function checkForSecretsJSON(cb){
    if (fs.existsSync('./secrets/mongo-settings-with-credentials.json')) {
        if(validate(JSON.parse(fs.readFileSync("./secrets/mongo-settings-with-credentials.json")), secretSchema, {required: true}).valid){
            console.log("\n\u001b[32m [V] Secrets-file is valid\u001b[0m")
            cb();
        }else
            cb(new Error("\u001b[31m [X] Secrets-file not valid (./secrets/mongo-settings-with-credentials.json)!\u001b[0m"));
    }else
        cb(new Error("\u001b[31m [X] Secrets-file not found (./secrets/mongo-settings-with-credentials.json)!\u001b[0m"));
}
function start(){
    console.log("\u001b[32m [V] listening on port 3000 \u001b[0m");
    console.log("\u001b[93m---server-output---\u001b[0m")
    return execSync('node ./bin/www', {stdio: 'inherit'});
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
        }).on('end', ()=>{console.log("\n\u001b[32m [V] Documentation created in './documentation/': open index.html in browser \u001b[0m")}));
}

const build = series(runLinter, compileTypeScript, minifyJS, checkForSecretsJSON, runTests);

exports.lint = runLinter;
exports.test = runTests;
exports.compile = compileTypeScript;
exports.min = minifyJS;
exports.build = build;
exports.start = series(checkForSecretsJSON, start);
exports.doc = createDocumentation;

exports.default = series(build, createDocumentation, start);
