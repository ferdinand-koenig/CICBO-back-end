const createError = require('http-errors');
const express = require('express');
import {Request, Response, NextFunction, ErrorRequestHandler, json} from 'express';
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

//new stuff
const jsonParser = require('body-parser').json(); //vllt express.json()?
const validate = require('jsonschema').validate;
const async = require('async');
const assert = require('assert');

//mongo
// export settings as json
const MongoClient = require('mongodb').MongoClient;
const dbName = "entries";

//outsourcen, sodass 1. Mongo eigenen Klasse?
// 2. Passwort outsourcen, sodass es nicht auf git landet
const uri = "mongodb+srv://CICBO-web-server:huzf0JflG28amvqf@cluster0.x7gev.mongodb.net/" + dbName + "?retryWrites=true&w=majority";
const collectionNameGuest = "guest",
    collectionNameRoom = "room";

//schema
import roomSchema from './schema/room.json';
import guestSchema from './schema/guest.json';

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
    const guest = req.body;
    if(!validate(guest, guestSchema, {required: true}).valid){
        console.log("Not valid guest (schema)");
        sendResponse(res, new HTMLStatus(400, "Guest does not have right syntax. (Schema)"));
    }else if(!(guest.mail || guest.phone)){
        console.log("Not valid guest (missing mail or phone)");
        sendResponse(res, new HTMLStatus(400, "Guest does not have right syntax. (Mail or phone is required)"));
    }else{
        console.log("Valid new room.");
        let guestCollection: any, roomCollection: any, mongoClient: any, existing: boolean;
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: Function) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: any, client: any) => {
                        assert.strictEqual(err, null);

                        mongoClient = client;
                        guestCollection = client.db(dbName).collection(collectionNameGuest);
                        roomCollection = client.db(dbName).collection(collectionNameRoom);
                        callback(null);
                    });
                },
                //find room in db
                (callback: Function) => {
                    roomCollection.find({"number": guest.room.number}).toArray((err: any, docs: any) => {
                        assert.strictEqual(err, null);
                        if(docs.length!=0){
                            console.log("Found room in database!");
                            existing = true;
                            callback(null);
                        }else{
                            existing = false;
                            callback(null, new HTMLStatus(418, "I'm a teapot and not a valid room. (No existing room with this number)"));
                        }
                    })
                },
                //calculate ID and insert
                (callback: Function) => {
                    if(existing) {
                        guestCollection.find({}).toArray((err: any, docs: any) => {
                            assert.strictEqual(err, null);
                            const id = {id: docs.length == 0 ? 0 : docs.reduce((a: any, b: any) => a.id > b.id ? a : b).id + 1};
                            console.log("Calculated new ID " + guest.id);
                            guestCollection.insertOne(
                                Object.assign(id, guest),
                                (err: any) => {
                                    assert.strictEqual(err, null);
                                    console.log("Guest created.");
                                    callback(null, new HTMLStatus(201, "Guest created."));
                                }
                            )
                        });
                    }else{
                        callback(null);
                    }
                }
            ],
            (err: any, result: Array<HTMLStatus | undefined>) => { //oder () =>
                mongoClient.close();
                console.log("Connection closed.")
                result.forEach(value => {
                    if(value){
                        sendResponse(res, value);
                    }
                });
            }
        );
    }
});
app.get('/guest', jsonParser, (req: Request, res: Response) => {
    let guestCollection: any, roomCollection: any, mongoClient: any, guests: any;
    async.series(
        [
            // Establish Covalent Analytics MongoDB connection
            (callback: Function) => {
                MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: any, client: any) => {
                    assert.strictEqual(err, null);

                    mongoClient = client;
                    roomCollection = client.db(dbName).collection(collectionNameRoom);
                    guestCollection = client.db(dbName).collection(collectionNameGuest);
                    callback(null);
                });
            },
            (callback: Function) => {
                guestCollection.find({}).toArray((err: any, docs: any) => {
                    assert.strictEqual(err, null);
                    guests = docs;
                    let n=0;
                    guests.forEach((value: any) => {
                        delete value._id;
                        roomCollection.findOne({number: value.room.number}).then((doc: any) => {
                            value.room.name = doc.name;
                            value.room.active = doc.active;
                            if(++n == guests.length) callback(null);
                        });
                    });
                    if(guests.length === 0) callback(null);
                });
            }
        ],
        () => { //oder (err: any, result: Array<any>) =>
            mongoClient.close();
            console.log("Connection closed.");
            sendResponse(res, new HTMLStatus(200, guests));
        }
    );
});
//!!! sorting auf DB?

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
                        const room = req.body;
                        room.active = true;
                        collection.insertOne(
                            room,
                            (err: any) => {
                                assert.strictEqual(err, null);
                                console.log("Room created.");
                                callback(null, new HTMLStatus(201, "Room created."));
                            }
                        );
                    }else{
                        callback(null);
                    }
                }
            ],
            (err: any, result: Array<HTMLStatus | undefined>) => { //oder () =>
                mongoClient.close();
                console.log("Connection closed.")
                result.forEach(value => {
                    if(value){
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
        let roomCollection: any, guestCollection: any, mongoClient: any, objRes: any, roomNr=parseInt(req.params.roomNr);
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: Function) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: any, client: any) => {
                        assert.strictEqual(err, null);

                        mongoClient = client;
                        roomCollection = client.db(dbName).collection(collectionNameRoom);
                        guestCollection = client.db(dbName).collection(collectionNameGuest);
                        callback(null);
                    });
                },
                (callback: Function) => {
                    roomCollection.findOne({number: roomNr}).then((doc: any) => {
                        if(!doc){
                            callback(new Error('Room not found in DB!'), new HTMLStatus(404, "Room not found!"));
                        } else
                            callback(null);
                    });
                },
                (callback: Function) => {
                    guestCollection.findOne({room: {number: roomNr}}).then((doc: any) => {
                        objRes=doc;
                        callback(null);
                    });
                },
                (callback: Function) => {
                    if(objRes){
                        roomCollection.findOneAndUpdate({number: roomNr}, {$set: {active: false}}).then(() => {
                            console.log("set to inactive");
                            callback(null, new HTMLStatus(202, "Set active-flag to false."));
                        })
                    } else {
                        roomCollection.deleteOne({number: roomNr}, function (err: any, obj: any) {
                            assert.strictEqual(err, null) // if (err) throw err;
                            console.log("1 document deleted");
                            callback(null, new HTMLStatus(204));
                        });
                    }
                }
            ],
            (err: any, result: Array<HTMLStatus | undefined>) => { //oder () =>
                mongoClient.close();
                console.log("Connection closed.")
                result.forEach(value => {
                    if(value)
                        sendResponse(res, value);
                });
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
                        delete value._id;
                    });
                    callback(null, docs.sort((n1: any, n2: any) => n1.number - n2.number));
                });
            }
        ],
        (err: any, result: Array<string | undefined>) => { //oder () =>
            mongoClient.close();
            console.log("Connection closed.");
            sendResponse(res, new HTMLStatus(200, result[1]));
        }
    );
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
    const n = Math.floor(Number(str));
    return n !== Infinity && String(n) === str && n >= 0;
}


module.exports = app;

//what is not checked (semicolons, return types of functions)
