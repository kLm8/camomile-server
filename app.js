/*
The MIT License (MIT)

Copyright (c) 2013-2014 CNRS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


var express = require('express');
var http = require('http'); 
var path = require('path');
var routes = require('./routes/routes');
var mongoose = require('mongoose');
var program = require('commander');
var mongoStore = require('connect-mongo')(express);
var app = express();
var userAPI = require('./controllers/UserAPI');
var authenticate = require('./middleware/authenticate');
	
//parsing the arguments
program
.option('-p, --server_port <port>', 'Local port to listen to (default: 3000)', parseInt)
.option('-d, --db_host <dbhost>', 'Database host (default: mongodb://localhost)')
.option('-P, --db_port <dbport>', 'Database port (default: 27017)', parseInt)
.option('-n, --db_name <dbname>', 'Database name (default: camomile)')
.option('-r, --root_pass <dbname>', 'Password of the root user (default: camomile)')
.option('-v, --video_path <vpath>', 'Path to the video directory (default: /corpora/video)')
.option('-c, --config_dir <cdir>', 'Path to the directory containing config. files (default: .)')
.option('-t, --cookie_timeout <timeout>', 'Set the cookie timeout (unit is hour, default: 3h)', parseInt)
.parse(process.argv);
	
// Cross-domain connections.
// The current solution is to allow CORS by overloading the middleware function:
var allowCrossDomain = function(req, res, next) {
	res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', req.headers.origin)
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
	res.header('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
	// intercept OPTIONS method
    if ('OPTIONS' == req.method) res.send(200); // force the server to treat such a request as a normal GET or POST request.
    else  next(); // otherwise, do anything else
}

//here is the configuration, where server's parameters will be set
var config;
if (program.config_dir == undefined) config = require('./config');
else config = require(program.config_dir + '/config');

GLOBAL.config_dir = program.config_dir || false;
GLOBAL.video_path = program.video_path || config.video_path;

var server_port = program.server_port || config.server_port;
var db_name   = program.db_name || config.mongo.db_name;
var db_host   = process.env.MONGOLAB_URI || program.db_host || config.mongo.db_host;
var video_path  = program.video_path || config.video_path;
var cookie_timeout = program.cookie_timeout || config.cookie_timeout;

db_name = db_host + '/' + db_name;
mongoose.connect(db_name);                                                             // connect to the dbkey: "value", 
mongoose.connection.on('open', function(){
    console.log("Connected to Mongoose:") ;
});


keepSession = function (req, res, next) {
    var err = req.session.error,
        msg = req.session.success;
    delete req.session.error;
    delete req.session.success;
    res.locals.message = '';
    if (err) res.locals.message = '<p class="msg error">' + err + '</p>';
    if (msg) res.locals.message = '<p class="msg success">' + msg + '</p>';
    next();
}

//store all information related to sessions
var sessionStore = new mongoStore({mongoose_connection: mongoose.connection, 
            db: mongoose.connections[0].db, clear_interval: 60}, function(){
                          console.log('connect mongodb session sucacess...');
});

// configure all environments
app.configure(function(){
    app.set('port', server_port);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(allowCrossDomain); // for CORS problem!
    app.use(express.cookieParser('your secret here'));    
    app.use(express.session({
        key : "camomile.sid",
        secret: "123camomile",
        cookie: {maxAge: cookie_timeout*3600000},
        store: sessionStore
    }));
    app.use(keepSession);    
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
});

// development only
if ('development' == app.get('env')) app.use(express.errorHandler());

//start routes:
routes.initialize(app);

User.findOne({username:"root"}, function (error, user) {
    if (user || program.root_pass) {
        if (!user) var user = new User({username: "root", role: "admin"})
        if (program.root_pass) {
            hash(program.root_pass, function (error, salt, hash) {
                user.salt = salt;
                user.hash = hash;               
                user.save(function (error, user) {});                      
            });
        }
        http.createServer(app).listen(app.get('port'), process.env.IP, function(){
            console.log('Express server listening on port ' + app.get('port'));
        });
    }
    else console.log("root user does not exist and root password is not defined to create root user (add '--root_pass' option)");
});
