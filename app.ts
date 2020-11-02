let createError = require('http-errors');
let express = require('express');
import { Request, Response, NextFunction, ErrorRequestHandler  } from 'express';
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

//interfaces
interface HTMLStatus{
    code: number,
    message?: string
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
        let collection: any, mongoClient: any, notExisting: boolean, status: HTMLStatus = <HTMLStatus>{};
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
                            status.code = 409;
                            status.message = "Room with this number already exists"
                            //res.status(409).send('Room with this number already exists');
                            callback(null, status);
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
                                status.code = 201;
                                status.message = "Room created"
                                callback(null, status);
                            }
                        )
                    }else{
                        callback(null);
                    }
                }
            ],
            (err: any, result: Array<HTMLStatus | undefined>) => { //oder () =>
                console.table(result);
                mongoClient.close();
                console.log("Connection closed.")
                result.forEach(value => {
                    console.log(value);
                    if(typeof value !== 'undefined'){
                        console.log("triggered!");
                        sendResponse(res, value);
                    }
                });
            }
        );
    }else{
        console.log("Not valid room");
        sendResponse(res, {"code": 400, "message": "Room does not have right syntax."});
    }
});

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
function sendResponse(res: Response, status: HTMLStatus){
    //res.status(200).end();
    //res.sendStatus(200);
    //res.status(201).send('Room created.');
    if(typeof status.message === 'undefined'){
        res.sendStatus(status.code);
    }else{
        res.status(status.code).send(status.message);
    }
}


module.exports = app;
