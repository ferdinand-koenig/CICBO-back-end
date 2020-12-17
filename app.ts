import createError from "http-errors";
import express, {NextFunction, Request, Response} from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';

//mongo
import {Collection, MongoClient} from "mongodb";
import dbSettings from './secrets/mongo-settings-with-credentials.json';
//schema
import roomSchema from './schema/room.json';
import guestSchema from './schema/guest.json';
import searchFilterSchema from './schema/searchFilter.json';
import shiftSchema from './schema/shift.json';
import shiftsSchema from './schema/shifts.json';
import staffSchema from './schema/staff.json';
import alarmSchema from './schema/alarm.json';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const indexRouter = require('./routes');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const usersRouter = require('./routes/users');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cors = require('cors');
const app = express();

const jsonParser = express.json();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const validate = require('jsonschema').validate;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const async = require('async');

const uri = dbSettings.protocol + "://" + dbSettings.credentials.user + ":" + dbSettings.credentials.pwd + "@" + dbSettings.uri + "/" + dbSettings.dbName + "?" + dbSettings.uriOptions;

//interfaces
interface InternalRoomSchema{
    number: number,
    name?: string,
    active?: boolean
}
interface InternalGuestSchema {
    _id?: string
    id?: number
    firstName: string;
    name: string;
    mail?: string;
    phone?: string;
    address?: string;
    arrivedAt: string;
    leftAt: string;
    room: InternalRoomSchema;
}
interface InternalShiftSchema{
    arrivedAt: string,
    leftAt: string,
    rooms?: Array<InternalRoomSchema>
}
interface InternalStaffSchema{
    _id?: string,
    id?: number,
    firstName: string,
    name: string,
    mail?: string,
    phone?: string,
    address?: string
    shifts: Array<InternalShiftSchema>
}
interface InternalSearchFilter{
    id?: Record<string, unknown>;
    sortByName?: boolean;
    firstName?: string;
    name?: string;
    arrivedAt?: string;
    leftAt?: string;
    mail?: string;
    phone?: string;
    address?: string;
    number?: number;
}

//classes
class HTMLStatus{
    code: number;
    message?: string | InternalGuestSchema[] |{ staffMembers: HTMLStatus | (InternalGuestSchema | InternalStaffSchema)[] | undefined; guests: HTMLStatus | (InternalGuestSchema | InternalStaffSchema)[] | undefined; };

    constructor(code: number, message?: string | InternalGuestSchema[] | { staffMembers: HTMLStatus | (InternalGuestSchema | InternalStaffSchema)[] | undefined; guests: HTMLStatus | (InternalGuestSchema | InternalStaffSchema)[] | undefined; }) {
        this.code = code;
        if(message) this.message = message;
    }
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

const allowedOrigins = ['http://CICBO.com',
    'http://localhost:3000',
    'http://localhost:4200',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:4200',
    'https://CICBO.com',
    'https://localhost:3000',
    'https://localhost:4200',
    'https://127.0.0.1:3000',
    'https://127.0.0.1:4200'
 ];
app.use(cors({
    origin: function(origin: string, callback: (arg0: Error | null, arg1: boolean) => void){
        // allow requests with no origin
        // (like mobile apps or curl requests)
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
            const msg = 'The CORS policy for this site does not ' +
                'allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/schema', express.static('schema'));

app.use('/', indexRouter);
app.use('/users', usersRouter);

//STAFF
app.post('/staff', jsonParser, (req: Request, res: Response) => {
    const staff = req.body;
    if(!validate(staff, staffSchema, {required: true}).valid){
        console.log("Not valid staff member (schema)");
        sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Staff member does not have right syntax. (Schema)\n".concat(validate(staff, staffSchema, {required: true})) : "Staff member does not have right syntax. (Schema)"));
    }else if(!(staff.mail || staff.phone)){
        console.log("Not valid staff member (missing mail or phone)");
        sendResponse(res, new HTMLStatus(400, "Staff member does not have right syntax. (Mail or phone is required)"));
    }else{
        console.log("Valid new staff member.");
        let staffCollection: Collection, staffShiftCollection: Collection, mongoClient: MongoClient, id: number;
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            mongoClient = client;
                            staffCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaff);
                            staffShiftCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaffShift);
                            callback(null);
                        }
                    });
                },
                //calculate ID and insert
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    staffCollection.find({}).toArray((err: Error, docs) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            id = docs.length == 0 ? 0 : docs.reduce((a, b) => a.id > b.id ? a : b).id + 1;
                            console.log("Calculated new ID " + id);
                            staffCollection.insertOne(
                                Object.assign({id: id}, staff),
                                (err: Error) => {
                                    if(err){
                                        callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                    }else {
                                        console.log("Staff member created.");
                                        callback(null);
                                    }
                                }
                            )
                        }
                    });
                },
                //add new entry in shifts
                (callback: (arg0: null | Error, arg1: HTMLStatus) => void) => {
                    const shift = {id: -1, shifts: []};
                    shift.id = id;
                    staffShiftCollection.insertOne(
                        shift,
                        (err: Error) => {
                            if(err){
                                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                            }else {
                                console.log("Shift object created.");
                                callback(null, new HTMLStatus(201, id.toString()));
                            }
                        }
                    );
                }
            ],
            (err: Error, result: Array<HTMLStatus | undefined>) => {
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
app.delete('/staff/:staffId', jsonParser, (req: Request, res: Response) => {
    if(isNormalInteger(req.params.staffId)){
        let staffShiftCollection: Collection, staffCollection: Collection, shiftRoomCollection: Collection, mongoClient: MongoClient;
        const staffId = parseInt(req.params.staffId);
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            mongoClient = client;
                            staffCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaff);
                            staffShiftCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaffShift);
                            shiftRoomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameShiftRoom);
                            callback(null);
                        }
                    });
                },
                (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => {
                    staffShiftCollection.findOne({id: staffId}).then((doc) => {
                        if(!doc){
                            callback(new Error('Staff member not found in DB!'), new HTMLStatus(404, "Staff member not found!"));
                        } else
                            callback(null);
                    });
                },
                (callback: (arg0: Error | null, arg1?: HTMLStatus) => void) => {
                    staffShiftCollection.deleteOne({id: staffId}, function (err: Error) {
                        if(err){
                            callback(new Error("FATAL: Error in staff-shift deletion of staff member " + staffId), new HTMLStatus(500, "FATAL: Error in shift-room deletion of staff member ".concat(String(staffId)).concat(". Contact your admin.")));
                        }else{
                            callback(null);
                        }
                    });
                },
                (callback: (arg0: Error | null, arg1?: HTMLStatus) => void) => {
                    shiftRoomCollection.deleteMany({id: staffId}, (err: Error) =>{
                        if(err){
                            callback(new Error("FATAL: Error in shift-room deletion of staff member " + staffId), new HTMLStatus(500, "FATAL: Error in shift-room deletion of staff member ".concat(String(staffId)).concat(". Contact your admin.")));
                        }else{
                            callback(null);
                        }
                    });
                },
                (callback: (arg0: Error | null, arg1: HTMLStatus) => void) => {
                    staffCollection.deleteOne({id: staffId}, function (err: Error) {
                        if(err){
                            callback(new Error("FATAL: Error in shift deletion of staff member " + staffId), new HTMLStatus(500, "FATAL: Error in shift-room deletion of staff member ".concat(String(staffId)).concat(". Contact your admin.")));
                        }else{
                            console.log("1 document deleted");
                            callback(null, new HTMLStatus(204));
                        }
                    });
                }
            ],
            (err: Error, result: Array<HTMLStatus | undefined>) => {
                mongoClient.close();
                console.log("Connection closed.")
                result.forEach(value => {
                    if(value)
                        sendResponse(res, value);
                });
            }
        );
    }else{
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied."));
    }
});
app.get('/staff', jsonParser, (req: Request, res: Response)=>{
    getStaff(0, req, res);
});
app.post('/staff/find', jsonParser, (req: Request, res: Response)=>{
    const searchFilter = req.body;
    if (!validate(searchFilter, searchFilterSchema, {required: true}).valid) {
        console.log("Not valid searchFilter (schema)");
        sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Invalid search-filter-object. (Schema)\n".concat(validate(searchFilter, searchFilterSchema, {required: true})): "Invalid search-filter-object. (Schema)"));
    }else
        getStaff(2, req, res);
});
app.get('/staff/:staffId', jsonParser, (req: Request, res: Response)=>{
    if(isNormalInteger(req.params.staffId)) {
        getStaff(1, req, res);
    }else
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied"));
});
app.put('/staff/:staffId', jsonParser, (req: Request, res: Response) => {
    if(!isNormalInteger(req.params.staffId)) {
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied"));
    }else {
        const staff = req.body, staffId = parseInt(req.params.staffId);
        if (!validate(staff, staffSchema, {required: true}).valid) {
            console.log("Not valid staff member (schema)");
            sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Staff member does not have right syntax. (Schema)\n".concat(validate(staff, staffSchema, {required: true})) : "Staff member does not have right syntax. (Schema)"));
        } else if (!(staff.mail || staff.phone)) {
            console.log("Not valid staff member (missing mail or phone)");
            sendResponse(res, new HTMLStatus(400, "Staff member does not have right syntax. (Mail or phone is required)"));
        } else {
            console.log("Valid new staff member.");
            let staffCollection: Collection, mongoClient: MongoClient;
            async.series(
                [
                    // Establish Covalent Analytics MongoDB connection
                    (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                        MongoClient.connect(uri, {
                            native_parser: true,
                            useUnifiedTopology: true
                        }, (err: Error, client: MongoClient) => {
                            if (err) {
                                callback(new Error("FATAL: Error in put staff " + staffId), new HTMLStatus(500, "FATAL: Error in put staff member ".concat(String(staffId)).concat(". Contact your admin.")));
                            } else {
                                mongoClient = client;

                                staffCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaff);
                                callback(null);
                            }
                        });
                    },
                    //calculate ID and insert
                    (callback: (arg0: Error | null, arg1: HTMLStatus) => void) => {
                        console.table(staff);
                        staffCollection.updateOne(
                            {id: staffId}, {$set: staff},
                            (err: Error) => {
                                if (err) {
                                    callback(new Error("FATAL: Error in put staff " + staffId), new HTMLStatus(500, "FATAL: Error in put staff member ".concat(String(staffId)).concat(". Contact your admin.")));
                                } else {
                                    console.log("Staff member updated.");
                                    callback(null, new HTMLStatus(200, "Staff member updated."));
                                }
                            }
                        );
                    }
                ],
                (err: Error, result: Array<HTMLStatus | undefined>) => {
                    mongoClient.close();
                    console.log("Connection closed.")
                    result.forEach(value => {
                        if (value) {
                            sendResponse(res, value);
                        }
                    });
                }
            );
        }
    }
});

//SHIFT
app.post('/staff/:staffId/shift', jsonParser, (req: Request, res: Response) => {
    if(!isNormalInteger(req.params.staffId)){
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied"));
    }else {
        manipulateShifts(true, req, res);
    }
});
app.put('/staff/:staffId/shift', jsonParser, (req: Request, res: Response) => {
    if(!isNormalInteger(req.params.staffId)){
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied"));
    }else {
        manipulateShifts(false, req, res);
    }
});

//GUEST
app.post('/guest', jsonParser, (req: Request, res: Response) => {
    const guest = req.body;
    if(!validate(guest, guestSchema, {required: true}).valid){
        console.log("Not valid guest (schema)");
        sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Guest does not have right syntax. (Schema)\n".concat(validate(guest, guestSchema, {required: true})) : "Guest does not have right syntax. (Schema)"));
    }else if(!(guest.mail || guest.phone)) {
        console.log("Not valid guest (missing mail or phone)");
        sendResponse(res, new HTMLStatus(400, "Guest does not have right syntax. (Mail or phone is required)"));
    }else if(guest.arrivedAt > guest.leftAt) {
        console.log("Timestamps not correct!");
        sendResponse(res, new HTMLStatus(400, "arrivedAt is after leftAt!"));
    }else{
        console.log("Valid new guest.");
        let guestCollection: Collection, roomCollection: Collection, mongoClient: MongoClient, existing: boolean;
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error in post guest."), new HTMLStatus(500, "FATAL: Error in post guest".concat(". Contact your admin.")));
                        }else {
                            mongoClient = client;
                            guestCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameGuest);
                            roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                            callback(null);
                        }
                    });
                },
                //find room in db
                (callback: (arg0: null, arg1?: HTMLStatus | undefined) => void) => {
                    roomCollection.findOne({"number": guest.room.number}).then((doc) => {
                        if(doc){
                            if(!doc.active){
                                existing = false;
                                callback(null, new HTMLStatus(418, "I'm a teapot and not a valid room. (Room with this number is inactive)"));
                            }else{
                                console.log("Found room in database!");
                                existing = true;
                                callback(null);
                            }
                        }else{
                            existing = false;
                            callback(null, new HTMLStatus(418, "I'm a teapot and not a valid room. (No existing room with this number)"));
                        }
                    })
                },
                //calculate ID and insert
                (callback: (arg0: null | Error, arg1?: HTMLStatus | undefined) => void) => {
                    if(existing) {
                        guestCollection.find({}).toArray((err: Error, docs) => {
                            if(err){
                                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                            }else {
                                const id = {id: docs.length == 0 ? 0 : docs.reduce((a, b) => a.id > b.id ? a : b).id + 1};
                                console.log("Calculated new ID " + id);
                                guestCollection.insertOne(
                                    Object.assign(id, guest),
                                    (err: Error) => {
                                        if(err){
                                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                        }else {
                                            console.log("Guest created.");
                                            callback(null, new HTMLStatus(201, id.id));
                                        }
                                    }
                                );
                            }
                        });
                    }else{
                        callback(null);
                    }
                }
            ],
            (err: Error, result: Array<HTMLStatus | undefined>) => {
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
    let guestCollection: Collection, roomCollection: Collection, mongoClient: MongoClient, guests: Array<InternalGuestSchema>;
    async.series(
        [
            // Establish Covalent Analytics MongoDB connection
            (callback: (error: Error| null, htmlStatus?: HTMLStatus) => void) => {
                MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                    if(err){
                        callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                    }else {

                        mongoClient = client;
                        roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                        guestCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameGuest);
                        callback(null);
                    }
                });
            },
            (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                guestCollection.find({}).toArray((err: Error, docs) => {
                    if(err){
                        callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                    }else {
                        guests = docs;
                        let n = 0;
                        guests.forEach((value) => {
                            delete value._id;
                            roomCollection.findOne({number: value.room.number}).then((doc) => {
                                value.room.name = doc.name;
                                value.room.active = doc.active;
                                if (++n == guests.length) callback(null);
                            });
                        });
                        if (guests.length === 0) callback(null);
                    }
                });
            }
        ],
        () => {
            mongoClient.close();
            console.log("Connection closed.");
            sendResponse(res, new HTMLStatus(200, guests));
        }
    );
});
app.post('/guest/find', jsonParser, (req: Request, res: Response) => {
    const searchFilter = req.body;
    if (!validate(searchFilter, searchFilterSchema, {required: true}).valid) {
        console.log("Not valid searchFilter (schema)");
        sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Invalid search-filter-object. (Schema)\n".concat(validate(searchFilter, searchFilterSchema, {required: true})) : "Invalid search-filter-object. (Schema)"));
    } else if(!((searchFilter.arrivedAt && searchFilter.leftAt) || (!searchFilter.arrivedAt && !searchFilter.leftAt))) {
        console.log("Not properly set dates");
        sendResponse(res, new HTMLStatus(400, "Either both dates should be set or none."));
    }else {
        let arrivedAt: string, leftAt: string;
        const sortByName : boolean = searchFilter.sortByName;
        delete searchFilter.sortByName;
        if(searchFilter.arrivedAt && searchFilter.leftAt) {
            arrivedAt = searchFilter.arrivedAt;
            delete searchFilter.arrivedAt;
            leftAt = searchFilter.leftAt;
            delete searchFilter.leftAt;
        }
        let guestCollection: Collection, roomCollection: Collection, mongoClient: MongoClient, guests: Array<InternalGuestSchema>;
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            mongoClient = client;
                            roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                            guestCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameGuest);
                            callback(null);
                        }
                    });
                },
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    guestCollection.find(searchFilter).sort(sortByName ? {name: 1} : {}).toArray((err: Error, docs) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            guests = docs.filter(item => (arrivedAt && leftAt)? overlappingPeriodOfTime(item.arrivedAt, item.leftAt, arrivedAt, leftAt) : true);
                            let n = 0;
                            guests.forEach((value) => {
                                delete value._id;
                                roomCollection.findOne({number: value.room.number}).then((doc) => {
                                    value.room.name = doc.name;
                                    value.room.active = doc.active;
                                    if (++n == guests.length) callback(null);
                                });
                            });
                            if (guests.length === 0) callback(null);
                        }
                    });
                }
            ],
            () => {
                mongoClient.close();
                console.log("Connection closed.");
                sendResponse(res, new HTMLStatus(200, guests));
            }
        );
    }
});
app.get('/guest/:guestId', jsonParser, (req: Request, res: Response) =>{
    if(isNormalInteger(req.params.guestId)) {
        let guestCollection: Collection, roomCollection: Collection, mongoClient: MongoClient, guest: InternalGuestSchema;
        const guestId = parseInt(req.params.guestId);
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {
                        native_parser: true,
                        useUnifiedTopology: true
                    }, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            mongoClient = client;
                            roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                            guestCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameGuest);
                            callback(null);
                        }
                    });
                },
                (callback: (arg0: Error | null, arg1: HTMLStatus) => void) => {
                    guestCollection.findOne({id: guestId}).then((doc) => {
                        if (!doc) callback(new Error('Guest not found in DB!'), new HTMLStatus(404, "Guest not found!"));
                        guest=doc;
                        delete guest._id;
                        roomCollection.findOne({number: guest.room.number}).then((doc) => {
                            guest.room.name = doc.name;
                            guest.room.active = doc.active;
                            callback(null, new HTMLStatus(200, JSON.stringify(guest)));
                        });
                    });
                }
            ],
            (err: Error, result:Array<HTMLStatus | undefined>) => {
                mongoClient.close();
                console.log("Connection closed.");
                result.forEach(value => {
                    if(value){
                        sendResponse(res, value);
                    }
                });
            }
        );
    }else{
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied"));
    }
});
app.put('/guest/:guestId', jsonParser, (req: Request, res: Response) =>{
    if(!isNormalInteger(req.params.guestId)) {
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied"));
    }else{
        const guestId = parseInt(req.params.guestId);
        const guest = req.body;
        if (!validate(guest, guestSchema, {required: true}).valid) {
            console.log("Not valid guest (schema)");
            sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Guest does not have right syntax. (Schema)\n".concat(validate(guest, guestSchema, {required: true})) : "Guest does not have right syntax. (Schema)"));
        } else if (!(guest.mail || guest.phone)) {
            console.log("Not valid guest (missing mail or phone)");
            sendResponse(res, new HTMLStatus(400, "Guest does not have right syntax. (Mail or phone is required)"));
        } else if (guest.arrivedAt > guest.leftAt) {
            console.log("Timestamps not correct!");
            sendResponse(res, new HTMLStatus(400, "arrivedAt is after leftAt!"));
        } else {
            console.log("Valid guest update.");
            let guestCollection: Collection, roomCollection: Collection, mongoClient: MongoClient,
                roomExisting: boolean;
            async.series(
                [
                    // Establish Covalent Analytics MongoDB connection
                    (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                        MongoClient.connect(uri, {
                            native_parser: true,
                            useUnifiedTopology: true
                        }, (err: Error, client: MongoClient) => {
                            if (err) {
                                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                            } else {
                                mongoClient = client;
                                guestCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameGuest);
                                roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                                callback(null);
                            }
                        });
                    },
                    //find room in db
                    (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => {
                        roomCollection.find({"number": guest.room.number}).toArray((err: Error, docs) => {
                            if (err) {
                                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                            } else {
                                if (docs.length != 0) {
                                    console.log("Found room in database!");
                                    roomExisting = true;
                                    callback(null);
                                } else {
                                    roomExisting = false;
                                    callback(null, new HTMLStatus(418, "I'm a teapot and not a valid room. (No existing room with this number)"));
                                }
                            }
                        })
                    },
                    //calculate ID and insert
                    (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => {
                        if (roomExisting) {
                            guestCollection.updateOne({id: guestId}, {$set: guest}, (err: Error) => {
                                if (err) {
                                    callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                } else {
                                    console.log("Guest updated.");
                                    callback(null, new HTMLStatus(200, "Guest updated."));
                                }
                            });
                        } else {
                            callback(null);
                        }
                    }
                ],
                (err: Error, result: Array<HTMLStatus | undefined>) => {
                    mongoClient.close();
                    console.log("Connection closed.")
                    result.forEach(value => {
                        if (value) {
                            sendResponse(res, value);
                        }
                    });
                }
            );
        }
    }
});
app.delete('/guest/:guestId', jsonParser, (req: Request, res: Response) => {
    if(isNormalInteger(req.params.guestId)){
        let guestCollection: Collection, mongoClient: MongoClient;
        const guestId = parseInt(req.params.guestId);
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            mongoClient = client;
                            guestCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameGuest);
                            callback(null);
                        }
                    });
                },
                (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => {
                    guestCollection.findOne({id: guestId}).then((doc) => {
                        if(!doc){
                            callback(new Error('Guest not found in DB!'), new HTMLStatus(404, "Guest not found!"));
                        } else
                            callback(null);
                    });
                },
                (callback: (arg0: Error | null, arg1?: HTMLStatus) => void) => {
                    guestCollection.deleteOne({id: guestId}, function (err: Error) {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            console.log("1 document deleted");
                            callback(null, new HTMLStatus(204));
                        }
                    });
                }
            ],
            (err: never, result: Array<HTMLStatus | undefined>) => {
                mongoClient.close();
                console.log("Connection closed.")
                result.forEach(value => {
                    if(value)
                        sendResponse(res, value);
                });
            }
        );
    }else{
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied."));
    }
});

//ROOM
app.post('/room', jsonParser, (req: Request, res: Response) => {
    console.log("----- NEW POST /room -----")
    if(validate(req.body, roomSchema, {required: true}).valid) {
        console.log("Valid new room.");
        let collection: Collection, mongoClient: MongoClient, notExisting: boolean;
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            mongoClient = client;
                            collection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                            callback(null);
                        }
                    });
                },
                //find document in db
                (callback: (arg0: null | Error, arg1?: HTMLStatus | undefined) => void) => {
                    collection.find({"number": req.body.number}).toArray((err: Error, docs) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            if (docs.length != 0) {
                                console.log("Found in database!");
                                notExisting = false;
                                callback(null, new HTMLStatus(409, "Room with this number already exists"));
                            } else {
                                notExisting = true;
                                callback(null);
                            }
                        }
                    });
                },
                // Insert some documents
                (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => {
                    if (notExisting) {
                        const room = req.body;
                        room.active = true;
                        collection.insertOne(
                            room,
                            (err: Error) => {
                                if(err){
                                    callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                }else {
                                    console.log("Room created.");
                                    callback(null, new HTMLStatus(201, "Room created."));
                                }
                            }
                        );
                    }else{
                        callback(null);
                    }
                }
            ],
            (err: Error, result: Array<HTMLStatus | undefined>) => {
                mongoClient.close();
                console.log("Connection closed.")
                result.forEach(value => {
                    if(value){
                        sendResponse(res, value);
                    }
                });
            }
        );
    }else{
        console.log("Not valid room");
        sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Room does not have right syntax.\n".concat(validate(req.body, roomSchema, {required: true})) : "Room does not have right syntax."));
    }
});
app.delete('/room/:roomNr', jsonParser, (req: Request, res: Response) => {
    if(isNormalInteger(req.params.roomNr)){
        let roomCollection: Collection, guestCollection: Collection, shiftRoomCollection: Collection, mongoClient: MongoClient, objRes: InternalGuestSchema;
        const roomNr=parseInt(req.params.roomNr);
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            mongoClient = client;
                            roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                            guestCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameGuest);
                            shiftRoomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameShiftRoom);
                            callback(null);
                        }
                    });
                },
                (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => {
                    roomCollection.findOne({number: roomNr}).then((doc) => {
                        if(!doc){
                            callback(new Error('Room not found in DB!'), new HTMLStatus(404, "Room not found!"));
                        } else
                            callback(null);
                    });
                },
                (callback: (arg0: null) => void) => {
                    guestCollection.findOne({room: {number: roomNr}}).then((doc) => {
                        objRes=doc;
                        callback(null);
                    });
                },
                (callback: (arg0: null) => void) => {
                    shiftRoomCollection.findOne({room: roomNr}).then((shiftRoom) => {
                        if(!objRes) objRes=shiftRoom;
                        callback(null);
                    });
                },
                (callback: (arg0: null | Error, arg1: HTMLStatus) => void) => {
                    if(objRes){
                        roomCollection.findOneAndUpdate({number: roomNr}, {$set: {active: false}}).then(() => {
                            console.log("Set to inactive");
                            callback(null, new HTMLStatus(202, "Set active-flag to false."));
                        })
                    } else {
                        roomCollection.deleteOne({number: roomNr}, function (err: Error) {
                            if(err){
                                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                            }else {
                                console.log("1 document deleted");
                                callback(null, new HTMLStatus(204));
                            }
                        });
                    }
                }
            ],
            (err: Error, result: Array<HTMLStatus | undefined>) => {
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
    let collection: Collection, mongoClient: MongoClient;
    async.series(
        [
            // Establish Covalent Analytics MongoDB connection
            (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                    if(err){
                        callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                    }else {
                        mongoClient = client;
                        collection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                        callback(null);
                    }
                });
            },
            (callback: (arg0: Error | null, arg1: HTMLStatus | Array<InternalRoomSchema>) => void) => {
                collection.find({}).toArray((err: Error, docs) => {
                    if(err){
                        callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                    }else {
                        docs.forEach((value) => {
                            delete value._id;
                        });
                        callback(null, docs.sort((n1, n2) => n1.number - n2.number));
                    }
                });
            }
        ],
        (err: Error, result: Array<string | undefined>) => {
            mongoClient.close();
            console.log("Connection closed.");
            sendResponse(res, new HTMLStatus(200, result[1]));
        }
    );
});

//ALARM
app.post('/alarm', jsonParser, (req: Request, res: Response) => {
    const searchFilter = req.body;
    if (!validate(searchFilter, alarmSchema, {required: true}).valid) {
        console.log("Not valid searchFilter (schema)");
        sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Invalid search-filter-object. (Schema)\n".concat(validate(searchFilter, alarmSchema, {required: true})) : "Invalid search-filter-object. (Schema)"));
    } else {
        const sortByName: boolean = searchFilter.sortByName, typeEquGuest: boolean = (searchFilter.type === "guest");
        delete searchFilter.sortByName;
        delete searchFilter.type;
        const arrivedAt: string = searchFilter.arrivedAt;
        const leftAt: string = searchFilter.leftAt;
        delete searchFilter.arrivedAt;
        delete searchFilter.leftAt;
        let guestCollection: Collection, roomCollection: Collection, staffCollection: Collection, staffShiftCollection: Collection, shiftRoomCollection: Collection, mongoClient: MongoClient;
        let roomsToDo: Array<number> = [], roomsDone: Array<number> = [], staffIDs: Array<number> = [];
        async.series(
            [
                // Establish Covalent Analytics MongoDB connection
                (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                    MongoClient.connect(uri, {native_parser: true, useUnifiedTopology: true}, (err: Error, client: MongoClient) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            mongoClient = client;
                            roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                            guestCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameGuest);
                            staffCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaff);
                            staffShiftCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaffShift);
                            shiftRoomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameShiftRoom);
                            callback(null);
                        }
                    });
                },
                (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => { //find initial point
                    if(typeEquGuest) {
                        guestCollection.find(searchFilter).toArray((err: Error, guests) => {
                            if(err){
                                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                            }else {
                                guests = guests.filter((guest) => overlappingPeriodOfTime(arrivedAt, leftAt, guest.arrivedAt, guest.leftAt));
                                if (guests.length === 0) {
                                    callback(new Error('Guest not found in DB!'), new HTMLStatus(404, "Guest not found!"));
                                } else {
                                    guests.forEach((guest) =>
                                        roomsToDo.push(guest.room.number));
                                    callback(null);
                                }
                            }
                        });
                    }else{
                        staffCollection.findOne(searchFilter).then((staff) => {
                            let error: Error, HTMLres: HTMLStatus;
                            if(!staff){
                                callback(new Error('Staff member not found in DB!'), new HTMLStatus(404, "Staff member not found"));
                            }else{
                                shiftRoomCollection.find({id: staff.id}).toArray(async (err: Error, shiftRooms) => {
                                    let n= shiftRooms.length;
                                    console.log(n);
                                    if(n === 0){
                                        console.log("calling back 3")
                                        callback(null);
                                    }else {
                                        for (const shiftRoom of shiftRooms) { //{id: 0, index: 0, room: 2} {0, 1, 3}
                                            await staffShiftCollection.findOne({id: staff.id}).then((shiftObj) => {
                                                if (overlappingPeriodOfTime(arrivedAt, leftAt, shiftObj.shifts[shiftRoom.index].arrivedAt, shiftObj.shifts[shiftRoom.index].leftAt)) {
                                                    roomsToDo.push(shiftRoom.room);
                                                }
                                                if (--n === 0) {
                                                    if(roomsToDo.length === 0){
                                                        error = new Error('Staff member not found in DB!');
                                                        HTMLres = new HTMLStatus(404, "Staff member not found");
                                                    }
                                                    console.table(roomsToDo);
                                                    console.log("calling back 2")
                                                    callback(error, HTMLres);
                                                    return;
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        });
                    }
                },
                async (callback: (arg0: null) => void) => { //find all other stuff members (shift-objects)
                    console.table({roomsToDo: roomsToDo, roomsDone: roomsDone, staffIDs: staffIDs});
                    while(roomsToDo.length !== 0) {
                        const result = await findRoomsIteration(roomsToDo, roomsDone, staffIDs, shiftRoomCollection, staffShiftCollection, arrivedAt, leftAt);
                        console.table(result);
                        roomsToDo = result.roomsToDo;
                        roomsDone = result.roomsDone;
                        staffIDs = result.staffIDs;
                    }
                    callback(null);
                },
                (callback: { (arg0: null): void; (arg0: Error | null, arg1: InternalStaffSchema[] | HTMLStatus): void; }) => { //map stuff members
                    findStaff(staffCollection, staffShiftCollection, roomCollection, shiftRoomCollection, 2, 0, {id: {$in: staffIDs}}, false, callback);
                },
                (callback: (arg0: Error | null, arg1: Array<InternalGuestSchema> | HTMLStatus) => void) => { //find all other guests
                    const queryArray = roomsDone.map(x => ({number: x}));
                    guestCollection.find({room: {$in: queryArray}}).sort(sortByName ? {name: 1} : {}).toArray((err: Error, docs) => {
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            let n = 0;
                            docs.forEach((value) => {
                                delete value._id;
                                roomCollection.findOne({number: value.room.number}).then((doc) => {
                                    value.room.name = doc.name;
                                    value.room.active = doc.active;
                                    if (++n == docs.length) callback(null, docs);
                                });
                            });
                            if (docs.length === 0) callback(null, docs);
                        }
                    });
                }
            ],
            (err: Error, result: Array<Array<InternalGuestSchema | InternalStaffSchema> | undefined | HTMLStatus>) => {
                mongoClient.close();
                console.log("Connection closed.");
                
                let guests = result[4];

                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                guests = guests?.filter((item: { arrivedAt: string | number | Date; leftAt: string | number | Date; }) => beforeOrDuringPeriodOfTime(arrivedAt, leftAt, item.arrivedAt, item.leftAt));
                
                const answer = {staffMembers: result[3], guests: guests};
                if(result[1]){
                    sendResponse(res, <HTMLStatus>result[1]);
                }else
                {
                    sendResponse(res, new HTMLStatus(200, answer));
                }
            }
        );
    }
});

// catch 404 and forward to error handler
app.use(function(req: Request, res: Response, next: NextFunction) {
  next(createError(404));
});

// error handler
app.use(function(err: { message: never; status: never; }, req: Request, res: Response) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

//functions
/**
 * Sends Response and closes the connection
 * @param res express response object
 * @param status HTMLStatus with code and optionally message
 */
function sendResponse(res: Response, status: HTMLStatus): void{
    if(!status.message){
        res.sendStatus(status.code);
    }else{
        const message = (typeof status.message === 'string' && (status.message.charAt(1) === "[" || status.message.charAt(1) === "{")) ? status.message : JSON.stringify(status.message)
        res.status(status.code).send(message);
    }
}

/**
 * checks if a string is a positive integer value or zero
 * @param str
 * @returns boolean
 */
function isNormalInteger(str: string): boolean{
    const n = Math.floor(Number(str));
    return n !== Infinity && String(n) === str && n >= 0;
}

/**
 * Handles the manipulation of shifts of a given staff member
 * @param add boolean: true adds a shift, false replaces all shifts
 * @param req express request: req.body contains JSON in the form of shift.json or shifts.json
 * @param res express response
 */
function manipulateShifts(add: boolean, req: Request, res: Response){
    if(isNormalInteger(req.params.staffId)) {
        const shift = req.body;
        const staffId = parseInt(req.params.staffId);
        if (!validate(shift, add ? shiftSchema : shiftsSchema, {required: true}).valid) {
            console.log("Not valid shift (schema)");
            sendResponse(res, new HTMLStatus(400, (app.get('env') === 'development') ? "Shift does not have right syntax. (Schema)\n".concat(validate(shift, add ? shiftSchema : shiftsSchema, {required: true})) : "Shift does not have right syntax. (Schema)"));
        } else {
            let check = false;
            if (!add)
                shift.forEach((singleShift: InternalShiftSchema) => {
                    check = check ? true : singleShift.arrivedAt > singleShift.leftAt;
                });
            if((add && shift.arrivedAt > shift.leftAt) || check) {
                console.log("Timestamps not correct!");
                sendResponse(res, new HTMLStatus(400, "arrivedAt is after leftAt!"));
            }else {
                console.log("Valid new shift.");
                let staffShiftCollection: Collection, shiftRoomCollection: Collection, roomCollection: Collection,
                    mongoClient: MongoClient;
                let error: Error, response: HTMLStatus, warningForInactiveRoom = false;
                async.series(
                    [
                        // Establish Covalent Analytics MongoDB connection
                        (callback: (error1: Error | null, htmlStatus?: HTMLStatus) => void) => {
                            MongoClient.connect(uri, {
                                native_parser: true,
                                useUnifiedTopology: true
                            }, (err: Error, client: MongoClient) => {
                                if (err) {
                                    callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                } else {
                                    mongoClient = client;
                                    staffShiftCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaffShift);
                                    shiftRoomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameShiftRoom);
                                    roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                                    callback(null);
                                }
                            });
                        },
                        //find rooms in db
                        (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => {
                            if (add) {
                                let n: number = shift.rooms.length;
                                shift.rooms.forEach((room: InternalRoomSchema) => {
                                    roomCollection.findOne({"number": room.number}).then((doc) => {
                                        if (!doc) {
                                            if (!error) {
                                                error = new Error("Room " + room.number + " is not existing");
                                                response = new HTMLStatus(418, "I'm a teapot and not a valid room. (No existing room with number " + room.number + ")");
                                            }
                                        } else if (!doc.active) {
                                            if (!error) {
                                                error = new Error("Room " + room.number + " is not active");
                                                response = new HTMLStatus(418, "I'm a teapot and not a valid room. (Room with number " + room.number + " is inactive)");
                                            }
                                        }
                                        if (--n === 0) {
                                            callback(error, response);
                                        }
                                    });
                                });
                            } else {
                                let i: number = shift.length;
                                shift.forEach((singleShift: InternalShiftSchema) => {
                                    if (!singleShift.rooms) {
                                        console.error("singleShift.rooms was null! (manipulateShifts)");
                                        callback(new Error("singleShift.rooms was null!"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                    } else {
                                        let n: number = singleShift.rooms.length;
                                        singleShift.rooms.forEach((room) => {
                                            roomCollection.findOne({"number": room.number}).then((doc) => {
                                                if (!doc) {
                                                    callback(new Error("Room " + room.number + " is not existing"), new HTMLStatus(418, "I'm a teapot and not a valid room. (No existing room with number " + room.number + ")"));
                                                } else if (!doc.active) {
                                                    warningForInactiveRoom = true;
                                                }
                                                if (--n === 0)
                                                    if (--i === 0) callback(null);
                                            });
                                        });
                                    }
                                });
                            }
                        },
                        //add new entry in shifts
                        (callback: (arg0: Error | null, arg1: HTMLStatus) => void) => {
                            staffShiftCollection.findOne({id: staffId}).then((doc) => {
                                if (!doc) {
                                    callback(new Error("Staff member does not exist"), new HTMLStatus(404, "Staff member not found."));
                                } else {
                                    if (add) {
                                        //split in shift and shift-room
                                        const rooms = shift.rooms;
                                        delete shift.rooms;
                                        rooms.forEach((room: InternalRoomSchema) => {
                                            shiftRoomCollection.insertOne(
                                                {id: staffId, index: doc.shifts.length, room: room.number},
                                                (err: Error) => {
                                                    if (err) {
                                                        callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                                    } else {
                                                        console.log("Shift-room created");
                                                    }
                                                }
                                            );
                                        });
                                        doc.shifts.push(shift);
                                    } else {
                                        shiftRoomCollection.deleteMany({id: staffId}, (err: Error) => {
                                            if (err) {
                                                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                            } else {
                                                console.log("Deleted all shift-rooms for staff " + staffId);
                                            }
                                        });
                                        let n = 0;
                                        shift.forEach((singleShift: InternalShiftSchema) => {
                                            //split in shift and shift-room
                                            const rooms = singleShift.rooms;
                                            delete singleShift.rooms;
                                            if (!rooms) {
                                                console.error("singleShift.rooms was null! (manipulateShifts)");
                                                callback(new Error("singleShift.rooms was null!"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                            } else {
                                                rooms.forEach((room) => {
                                                    shiftRoomCollection.insertOne({
                                                            id: staffId,
                                                            index: n,
                                                            room: room.number
                                                        }, (err: Error) => {
                                                            if (err) {
                                                                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                                            } else {
                                                                console.log("Shift-room created");
                                                            }
                                                        }
                                                    );
                                                });
                                                n++;
                                            }
                                        });
                                        doc.shifts = shift;
                                    }
                                    staffShiftCollection.updateOne({id: staffId}, {$set: doc}, (err: Error) => {
                                        if (err) {
                                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                        } else {
                                            console.log(add ? "Shift added." : "Shifts replaced.");
                                            callback(null, new HTMLStatus(201, add ? "Shift added." : "Shifts replaced."));
                                        }
                                    });
                                }
                            });
                        }
                    ],
                    (err: Error, result: Array<HTMLStatus | undefined>) => {
                        mongoClient.close();
                        console.log("Connection closed.")
                        result.forEach(value => {
                            if (value) {
                                if (value.code === 201 && warningForInactiveRoom) {
                                    if(typeof value.message === 'string') value.message?.concat(" Warning: Shift-array contained inactive rooms!");
                                }
                                sendResponse(res, value);
                            }
                        });
                    }
                );
            }
        }
    }else{
        sendResponse(res, new HTMLStatus(400, "Invalid ID supplied"));
    }
}

/**
 * Handles all get methods on staff entity. Checks for valid ID (for mode 1) or valid search filter must be done beforehand!
 * @param mode 0: get all, 1: get one by ID, 2: get some by search filter
 * @param req
 * @param res
 */
function getStaff(mode: number, req: Request, res: Response){
    let staffCollection: Collection, staffShiftCollection: Collection, roomCollection: Collection, shiftRoomCollection: Collection, mongoClient: MongoClient;
    let searchFilter: InternalSearchFilter, staffId: number, sortByName = false;
    if(mode === 2){
        searchFilter = req.body;
        if (searchFilter.sortByName) {
            sortByName = searchFilter.sortByName;
        }else{
            console.error("searchFilter.sortByName was unexpectedly null! (getStaff)");
            sendResponse(res,new HTMLStatus(500, "FATAL: Error! Contact your admin."));
            return;
        }
        delete searchFilter.sortByName;
    }else if(mode === 1){
        staffId = parseInt(req.params.staffId);
    }
    async.series(
        [
            // Establish Covalent Analytics MongoDB connection
            (callback: (error: Error | null, htmlStatus?: HTMLStatus) => void) => {
                MongoClient.connect(uri, {
                    native_parser: true,
                    useUnifiedTopology: true
                }, (err: Error, client: MongoClient) => {
                    if(err){
                        callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                    }else {
                        mongoClient = client;
                        roomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameRoom);
                        staffCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaff);
                        staffShiftCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameStaffShift);
                        shiftRoomCollection = client.db(dbSettings.dbName).collection(dbSettings.collectionNameShiftRoom);
                        callback(null);
                    }
                });
            },
            (callback: { (arg0: null): void; (arg0: Error | null, arg1: InternalStaffSchema[] | HTMLStatus): void; }) => {
                findStaff(staffCollection, staffShiftCollection, roomCollection, shiftRoomCollection, mode, staffId, searchFilter, sortByName, callback);
            }
        ],
        (err: Error, result: Array<never>) => {
            mongoClient.close();
            console.log("Connection closed.");
            sendResponse(res, new HTMLStatus(200, (mode===1) ? result[1][0] : result[1]));
        }
    );
}

/**
 * Helper for getStaff(...) and Get alarm
 * Is accessing the collections to create the staff-objects
 * @param staffCollection
 * @param staffShiftCollection
 * @param roomCollection
 * @param shiftRoomCollection
 * @param mode see getStaff(...)
 * @param staffId
 * @param searchFilter
 * @param sortByName
 * @param callback async.series callback
 */
function findStaff(staffCollection: Collection, staffShiftCollection: Collection, roomCollection: Collection, shiftRoomCollection: Collection, mode: number, staffId: number, searchFilter: InternalSearchFilter, sortByName: boolean, callback: { (arg0: null): void; (arg0: Error | null, arg1: InternalStaffSchema[] | HTMLStatus): void; }):void{
    let staffs: Array<InternalStaffSchema>;
    staffCollection.find(mode ?
        ((mode === 1) ?
                {id: staffId}
                : searchFilter
        )
        : {})
        .sort((mode===2 && sortByName)? {name: 1} : {})
        .toArray((err: Error, docs) => {
            if(err){
                callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
            }else {
                staffs = docs;
                let n = staffs.length;
                staffs.forEach((staff) => {
                    delete staff._id;
                    staffShiftCollection.findOne({id: staff.id}).then(async (doc) => {
                        delete doc._id;
                        staff.shifts = doc.shifts;
                        if (staff.shifts.length === 0) {
                            if (--n === 0)
                                callback(null, staffs);
                        } else {
                            shiftRoomCollection.find({id: staff.id}).toArray((err: Error, shiftRooms) => {
                                if(err){
                                    callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                                }else {
                                    let i = shiftRooms.length;
                                    shiftRooms.forEach((shiftRoom) => {
                                        roomCollection.findOne({number: shiftRoom.room}).then((room) => {
                                            delete room._id;
                                            if (!staff.shifts[shiftRoom.index].rooms) {
                                                staff.shifts[shiftRoom.index].rooms = [];
                                            }
                                            //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                            staff.shifts[shiftRoom.index].rooms!.push(room);
                                                if (--i === 0)
                                                    if (--n === 0)
                                                        callback(null, staffs);
                                        });
                                    });
                                }
                            });
                        }
                    });
                });
                if (n === 0) callback(null, staffs);
            }
        });
}

/**
 * Single asynchronous iteration of get alarm
 * Used to find all rooms with potential exposure to covid
 * @param roomsToDo
 * @param roomsDone
 * @param staffIDs
 * @param shiftRoomCollection
 * @param staffShiftCollection
 * @param start
 * @param end
 * @returns Promise<{roomsToDo: number[], roomsDone: number[], staffIDs: number[]}> Promise with Object containing the roomsToDo for the next step, roomsDone (rooms that are already processed) and with staffIDs all IDs of the staff members
 */
async function findRoomsIteration(roomsToDo: Array<number>, roomsDone: Array<number>, staffIDs: Array<number>, shiftRoomCollection: Collection, staffShiftCollection: Collection, start:string, end:string): Promise<{roomsToDo: number[], roomsDone: number[], staffIDs: number[]}>{
    return new Promise((resolve) => {
        const newStaffIDs: Array<number>= [];
        const currentRoom = <number>roomsToDo.pop();
        roomsDone.push(currentRoom);
        async.series([
            (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => { //get staff IDs
                shiftRoomCollection.find({room: currentRoom}).toArray((err: Error, shiftRooms) => {
                    if(err){
                        callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                    }else {
                        let n = shiftRooms.length;
                        shiftRooms.forEach((shiftRoom) => { //all shifts with current room
                            staffShiftCollection.find({id: shiftRoom.id}).toArray((err: Error, shiftsObj) => {
                                shiftsObj.forEach((shiftObj) => {
                                    if (!staffIDs.includes(shiftRoom.id) && beforeOrDuringPeriodOfTime(start, end, shiftObj.shifts[shiftRoom.index].arrivedAt, shiftObj.shifts[shiftRoom.index].leftAt)) { //{id, index, room}
                                        staffIDs.push(shiftRoom.id);
                                        newStaffIDs.push(shiftRoom.id);
                                    }
                                });
                                if (--n === 0) callback(null);
                            });
                        });
                        if(n === 0) callback(null);
                    }
                });
            },
            (callback: (arg0: Error | null, arg1?: HTMLStatus | undefined) => void) => { //extract new rooms
                let n: number = newStaffIDs.length;
                newStaffIDs.forEach(async (newShiftRoom: number) => {
                    await shiftRoomCollection.find({id: newShiftRoom}).toArray(async (err: Error, additionalShiftRooms) => { //find all other shifts/rooms
                        if(err){
                            callback(new Error("FATAL: Error"), new HTMLStatus(500, "FATAL: Error! Contact your admin."));
                        }else {
                            await staffShiftCollection.findOne({id: newShiftRoom}).then((shiftObj) => {
                                additionalShiftRooms.forEach((additionalShiftRoom) => {
                                    if (!(roomsDone.includes(additionalShiftRoom.room) || roomsToDo.includes(additionalShiftRoom.room))
                                        && beforeOrDuringPeriodOfTime(start, end, shiftObj.shifts[additionalShiftRoom.index].arrivedAt, shiftObj.shifts[additionalShiftRoom.index].leftAt)) {
                                        roomsToDo.push(additionalShiftRoom.room);
                                        console.table({
                                            push: additionalShiftRoom.room,
                                            start: start,
                                            end: end,
                                            arrivedAt: shiftObj.shifts[additionalShiftRoom.index].arrivedAt,
                                            leftAt: shiftObj.shifts[additionalShiftRoom.index].leftAt
                                        });
                                    }
                                });
                            });
                            if (--n === 0) callback(null);
                        }
                    });
                });
                if(n === 0) callback(null);
            }
        ],
        ()=>{
            resolve({roomsToDo, roomsDone, staffIDs});
        });
    });
}

function overlappingPeriodOfTime(start: string | number | Date, end: string | number | Date, startPOT: string | number | Date, endPOT: string | number | Date): boolean{
    start = new Date(start);
    end = new Date(end);
    startPOT = new Date(startPOT);
    endPOT = new Date(endPOT);
    return (((startPOT <= start) && (start <= endPOT)) || ((startPOT <= end) && (end <= endPOT)))
}

/**
 * Checks if first period of time is in or before the second POT
 *
 * @param start
 * @param end
 * @param startPOT
 * @param endPOT
 * @returns true Iff (start, end) is before or During (startPOT, endPOT)
 */
function beforeOrDuringPeriodOfTime(start: string | number | Date, end: string | number | Date, startPOT: string | number | Date, endPOT: string | number | Date): boolean{
    return overlappingPeriodOfTime(start, end, startPOT, endPOT) || (new Date(start)) <= new Date(endPOT)
}

module.exports = {
    app,
    beforeOrDuringPeriodOfTime
};
