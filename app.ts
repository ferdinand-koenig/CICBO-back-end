var assert = require('assert');

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

//new stuff
const jsonParser = require('body-parser').json(); //vllt express.json()?
let validate = require('jsonschema').validate;
var async = require('async');
var assert = require('assert');

//mongo
const MongoClient = require('mongodb').MongoClient;
const dbName = "entries";
const uri = "mongodb+srv://CICBO-web-server:huzf0JflG28amvqf@cluster0.x7gev.mongodb.net/" + dbName + "?retryWrites=true&w=majority";
//const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const collectionNameGuest = "guest",
    collectionNameRoom = "room";



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

app.post('/guest', jsonParser, (req, res) => {
  //check room
  //gen id
  //add id and modify room; insert
})

app.post('/room', jsonParser, (req, res) => {
    if(validate(req.body, {
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
    }, {required: true}).valid) {
        console.log("Valid new room.");
        let collection, mongoClient;
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback) => {
                    MongoClient.connect(uri, {native_parser:true, useUnifiedTopology: true}, (err, client) => {
                        assert.strictEqual(err, null);

                        mongoClient = client;
                        collection = client.db(dbName).collection(collectionNameRoom);
                        callback(null);
                    });
                },
                // Insert some documents
                (callback) => {
                    collection.insertOne(
                        req.body,
                        (err) => {
                            assert.strictEqual(err, null);
                            callback(null);
                        }
                    )
                },
                // Find some documents
                /*(callback) => {
                  mongodb.collection('sandbox').find({}).toArray(function(err, docs) {
                    assert.equal(err, null);
                    console.dir(docs);
                    callback(null);
                  });
                }*/
            ],
            () => {
                mongoClient.close();
                console.log("Connection closed.")
            }
        );
        //res.status(200).end();
        res.sendStatus(200);
        // === res.status(200).send('OK')
    }else{
        console.log("Not valid room");
        res.sendStatus(405); //check code
    }

  /*console.log("check");
  if(validate(req.body, {
        "number": "string",
        "name": "string"
      }, {required: true}).valid){
    client.connect(err => {
      const collection = client.db(dbName).collection(collectionNameRoom);
      // perform actions on the collection object
      collection.insertOne(req.body, function (err, res) {
        if (err) throw err;
        console.log("1 document inserted: " + req.body.toString());
      });
    }).then(()=> client.close());
  }else{
    //error
  }*/
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
