let createError = require('http-errors');
let express = require('express');
import {Request, Response, NextFunction, ErrorRequestHandler, json} from 'express';
let path = require('path');
let cookieParser = require('cookie-parser');
let logger = require('morgan');

let indexRouter = require('./routes/index');
let usersRouter = require('./routes/users');

let app = express();

//new stuff
const jsonParser = require('body-parser').json(); //vllt express.json()?
let validate = require('jsonschema').validate;
let async = require('async');
let assert = require('assert');

//mongo
const MongoClient = require('mongodb').MongoClient;
const dbName = "entries";
const uri = "mongodb+srv://CICBO-web-server:huzf0JflG28amvqf@cluster0.x7gev.mongodb.net/" + dbName + "?retryWrites=true&w=majority";
//const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const collectionNameGuest = "guest",
    collectionNameRoom = "room";

//schema
const roomSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://CICBO.com/room.json",
    "title": "Room",
    "type": "object",
    "required": [
        "number",
        "name"
    ],
    "properties": {
        "number": {
            "$id": "#root/number",
            "title": "Number",
            "type": "integer",
            "default": 0
        },
        "name": {
            "$id": "#root/name",
            "title": "Name",
            "type": "string",
            "default": ""
        }
    },
    "additionalProperties": false
}

//classes
class HTMLStatus{
    code: number;
    message?: string;

    constructor(code: number, message?: string) {
        this.code = code;
        if(message) this.message = message;
    }
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

app.post('/guest', jsonParser, (req: Request, res: Response) => {
  //check room
  //gen id
  //add id and modify room; insert
})

app.post('/room', jsonParser, (req: Request, res: Response) => {
    console.log("----- NEW POST /room -----")
    if(validate(req.body, roomSchema, {required: true}).valid) {
        console.log("Valid new room.");
        let collection: any, mongoClient: any, notExisting: boolean;
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: Function) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: any, client: any) => {
                        assert.strictEqual(err, null);

                        mongoClient = client;
                        collection = client.db(dbName).collection(collectionNameRoom);
                        callback(null);
                    });
                },
                //find document in db
                (callback: Function) => {
                    collection.find({"number": req.body.number}).toArray((err: any, docs: any) => {
                        assert.strictEqual(err, null);
                        if(docs.length!=0){
                            console.log("Found in database!");
                            notExisting = false;
                            callback(null, new HTMLStatus(409, "Room with this number already exists"));
                        }else{
                            notExisting = true;
                            callback(null);
                        }
                    })
                },
                // Insert some documents
                (callback: Function) => {
                    if (notExisting) {
                        collection.insertOne(
                            req.body,
                            (err: any) => {
                                //assert.strictEqual(err, null);
                                console.log("Room created.");
                                callback(null, new HTMLStatus(201, "Room created."));
                            }
                        )
                    }else{
                        callback(null);
                    }
                }
            ],
            (err: any, result: Array<HTMLStatus | undefined>) => { //oder () =>
                mongoClient.close();
                console.log("Connection closed.")
                result.forEach(value => {
                    if(typeof value !== 'undefined'){
                        sendResponse(res, value);
                    }
                });
            }
        );
        //class is inperformant! ~ 11 sec for post -- now 0,5 - 0,7
    }else{
        console.log("Not valid room");
        sendResponse(res, new HTMLStatus(400, "Room does not have right syntax."));
    }
});
app.delete('/room/:roomNr', jsonParser, (req: Request, res: Response) => {
    if(isNormalInteger(req.params.roomNr)){
        let collection: any, mongoClient: any;
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: Function) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: any, client: any) => {
                        assert.strictEqual(err, null);

                        mongoClient = client;
                        collection = client.db(dbName).collection(collectionNameRoom);
                        callback(null);
                    });
                },
                (callback: Function) => {
                    collection.deleteOne({number: parseInt(req.params.roomNr)}, function(err: any, obj: any) {
                        assert.strictEqual(err, null) // if (err) throw err;
                        console.log("1 document deleted");
                        callback(null);
                    });
                }
            ],
            (err: any, result: Array<HTMLStatus | undefined>) => { //oder () =>
                mongoClient.close();
                console.log("Connection closed.")
                sendResponse(res, new HTMLStatus(204, "Room deleted."));
            }
        );
    }else{
        sendResponse(res, new HTMLStatus(400, "Invalid room number."));
    }
});
app.get('/room', jsonParser, (req: Request, res: Response) => {
    let collection: any, mongoClient: any;
    async.series(
        [
            // Establish Covalent Analytics MongoDB connection
            (callback: Function) => {
                MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: any, client: any) => {
                    assert.strictEqual(err, null);

                    mongoClient = client;
                    collection = client.db(dbName).collection(collectionNameRoom);
                    callback(null);
                });
            },
            (callback: Function) => {
                collection.find({}).toArray((err: any, docs: any) => {
                    assert.strictEqual(err, null);
                    docs.forEach((value: any) => {
                        delete value._id
                    });
                    callback(null, docs.sort((n1: any, n2: any)=> n1.number - n2.number));
                })
            }
        ],
        (err: any, result: Array<any>) => { //oder () =>
            mongoClient.close();
            console.log("Connection closed.");
            sendResponse(res, new HTMLStatus(200, result[1]));
        }
    );
})

// catch 404 and forward to error handler
app.use(function(req: Request, res: Response, next: NextFunction) {
  next(createError(404));
});

// error handler
app.use(function(err: any, req: Request, res: Response, next: NextFunction) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

//functions
function sendResponse(res: Response, status: HTMLStatus): void{
    //res.status(200).end();
    //res.sendStatus(200);
    //res.status(201).send('Room created.');
    if(!status.message){
        res.sendStatus(status.code);
    }else{
        res.status(status.code).send(status.message);
    }
}

function isNormalInteger(str: string): boolean{
    let n = Math.floor(Number(str));
    return n !== Infinity && String(n) === str && n >= 0;
}


module.exports = app;

//what is not checked (semicolons, return types of functions)
