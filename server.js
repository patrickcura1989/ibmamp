var express = require("express");
var app = express();
var cfenv = require("cfenv");
var bodyParser = require('body-parser')

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

let mydb, cloudant;
var vendor; // Because the MongoDB and Cloudant use different API commands, we
            // have to check which command should be used based on the database
            // vendor.
var dbName = 'mydb';

// Separate functions are provided for inserting/retrieving content from
// MongoDB and Cloudant databases. These functions must be prefixed by a
// value that may be assigned to the 'vendor' variable, such as 'mongodb' or
// 'cloudant' (i.e., 'cloudantInsertOne' and 'mongodbInsertOne')

var insertOne = {};
var getAll = {};

insertOne.cloudant = function(doc, response) {
  mydb.insert(doc, function(err, body, header) {
    if (err) {
      console.log('[mydb.insert] ', err.message);
      response.send("Error");
      return;
    }
    doc._id = body.id;
    response.send(doc);
  });
}

const cheerio = require('cheerio');
const fs = require('fs');
const got = require('got');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fetch = require('node-fetch');
var dateFormat = require('dateformat');
getAll.cloudant = function(response) {
  var names = [];
  var dates = [];  
  //mydb.index( {name:'nameindex', type:'json', index:{fields:['date']}});
  mydb.list({ include_docs: true
    , descending: true
   }, function(err, body) {
    if (!err) {
      body.rows.forEach(function(row) {
        if(row.doc.payload)
          names.push(row.doc.payload);
          dates.push(row.doc.payload.date);
          //console.log('payload ', row.doc.payload);
          //console.log('names ', names);
      });

      (async () => {
        const response = await fetch('https://www.amp.co.nz/amp/returns-unit-prices/amp-new-zealand-retirement');
        const text = await response.text();
        //console.log(text);
        //var date = text.match(/(?<=\<p>Unit prices effective as at ).*(?=\<\/p>)/)[0].split("/").join('-')+'T00:00:00Z';
        //var date = text.match(/(?<=\<p>Unit prices effective as at ).*(?=\<\/p>)/)[0];
        var dateNZ = text.match(/(?<=\<p>Unit prices effective as at ).*(?=\<\/p>)/)[0].split("/");
        var date = dateNZ[2]+"-"+dateNZ[1]+"-"+dateNZ[0]+'T00:00:00Z';
        //console.log('asdfasfdsadf  fsdfdfdf   saddsf', date);
        //console.log('asdfsadffffffffff', dates.includes(date));        
        if(!dates.includes(date)) {
          var scraper = require('table-scraper');
          scraper
            .get('https://www.amp.co.nz/amp/returns-unit-prices/amp-new-zealand-retirement')
            .then(function(tableData) {
              //console.log(tableData[0][0]);
              //const result = tableData[0].find( ({ FUND }) => FUND === 'AMP Aggressive Fund' );
              //console.log(result[ 'UNIT PRICE ($)' ]) // { name: 'cherries', quantity: 5 }
              var output = {};
              var payload = {};
              var funds = [];
              var nikko={};
              var amp={};
              var asb={};
              var anz={};
              nikko.fund = "nikko";
              amp.fund = "amp";
              asb.fund = "asb";
              anz.fund = "anz";
              nikko.percent = 0.26;
              amp.percent = 0.25;
              asb.percent = 0.25;
              anz.percent = 0.24;
              nikko.price = tableData[0].find( ({ FUND }) => FUND === 'Nikko AM Growth Fund' )[ 'UNIT PRICE ($)' ];
              amp.price = tableData[0].find( ({ FUND }) => FUND === 'AMP Aggressive Fund' )[ 'UNIT PRICE ($)' ];
              asb.price = tableData[0].find( ({ FUND }) => FUND === 'ASB Growth Fund' )[ 'UNIT PRICE ($)' ];
              anz.price = tableData[0].find( ({ FUND }) => FUND === 'ANZ Growth Fund' )[ 'UNIT PRICE ($)' ];
              //console.log(anz.price) // { name: 'cherries', quantity: 5 }
              funds.push(nikko);
              funds.push(amp);
              funds.push(asb);
              funds.push(anz);
              payload.date = date;
              payload.funds = funds;
              output.payload = payload;
              var doc = JSON.parse(JSON.stringify(output));
              //console.log('sadfsdafsadfsdfsadfsadfsdf', JSON.stringify(payload));
              mydb.insert(doc, function(inserr, insbody, header) {
                if (inserr) {
                  console.log('[mydb.insert] ', inserr.message);
                }
              });
            });
        }
      })()
      //console.log('names ', names);      
      response.json(names);
      //return body.rows;
    }
  });
  return names;
}




let collectionName = 'mycollection'; // MongoDB requires a collection name.

insertOne.mongodb = function(doc, response) {
  mydb.collection(collectionName).insertOne(doc, function(err, body, header) {
    if (err) {
      console.log('[mydb.insertOne] ', err.message);
      response.send("Error");
      return;
    }
    doc._id = body.id;
    response.send(doc);
  });
}

getAll.mongodb = function(response) {
  var names = [];
  mydb.collection(collectionName).find({}, {fields:{_id: 0, count: 0}}).toArray(function(err, result) {
    if (!err) {
      result.forEach(function(row) {
        names.push(row.name);
      });
      response.json(names);
    }
  });
}

/* Endpoint to greet and add a new visitor to database.
* Send a POST request to localhost:3000/api/visitors with body
* {
*   "name": "Bob"
* }
*/
app.post("/api/visitors", function (request, response) {
  var userName = request.body.name;
  var doc = { "name" : userName };
  if(!mydb) {
    console.log("No database.");
    response.send(doc);
    return;
  }
  insertOne[vendor](doc, response);
});

/**
 * Endpoint to get a JSON array of all the visitors in the database
 * REST API example:
 * <code>
 * GET http://localhost:3000/api/visitors
 * </code>
 *
 * Response:
 * [ "Bob", "Jane" ]
 * @return An array of all the visitor names
 */
app.get("/api/visitors", function (request, response) {
  var names = [];
  if(!mydb) {
    response.json(names);
    return;
  }
  //console.log("asdfasdfasdfsadsdafdfffff",response);
  getAll[vendor](response);
});

// load local VCAP configuration  and service credentials
var vcapLocal;
try {
  vcapLocal = require('./vcap-local.json');
  console.log("Loaded local VCAP", vcapLocal);
} catch (e) { }

const appEnvOpts = vcapLocal ? { vcap: vcapLocal} : {}

const appEnv = cfenv.getAppEnv(appEnvOpts);

if (appEnv.services['compose-for-mongodb'] || appEnv.getService(/.*[Mm][Oo][Nn][Gg][Oo].*/)) {
  // Load the MongoDB library.
  var MongoClient = require('mongodb').MongoClient;

  dbName = 'mydb';

  // Initialize database with credentials
  if (appEnv.services['compose-for-mongodb']) {
    MongoClient.connect(appEnv.services['compose-for-mongodb'][0].credentials.uri, null, function(err, db) {
      if (err) {
        console.log(err);
      } else {
        mydb = db.db(dbName);
        console.log("Created database: " + dbName);
      }
    });
  } else {
    // user-provided service with 'mongodb' in its name
    MongoClient.connect(appEnv.getService(/.*[Mm][Oo][Nn][Gg][Oo].*/).credentials.uri, null,
      function(err, db) {
        if (err) {
          console.log(err);
        } else {
          mydb = db.db(dbName);
          console.log("Created database: " + dbName);
        }
      }
    );
  }

  vendor = 'mongodb';
} else if (appEnv.services['cloudantNoSQLDB'] || appEnv.getService(/[Cc][Ll][Oo][Uu][Dd][Aa][Nn][Tt]/)) {
  // Load the Cloudant library.
  var Cloudant = require('@cloudant/cloudant');

  // Initialize database with credentials
  if (appEnv.services['cloudantNoSQLDB']) {
    cloudant = Cloudant(appEnv.services['cloudantNoSQLDB'][0].credentials);
  } else {
     // user-provided service with 'cloudant' in its name
     cloudant = Cloudant(appEnv.getService(/cloudant/).credentials);
  }
} else if (process.env.CLOUDANT_URL){
  // Load the Cloudant library.
  var Cloudant = require('@cloudant/cloudant');

  if (process.env.CLOUDANT_IAM_API_KEY){ // IAM API key credentials
    let cloudantURL = process.env.CLOUDANT_URL
    let cloudantAPIKey = process.env.CLOUDANT_IAM_API_KEY
    cloudant = Cloudant({ url: cloudantURL, plugins: { iamauth: { iamApiKey: cloudantAPIKey } } });
  } else { //legacy username/password credentials as part of cloudant URL
    cloudant = Cloudant(process.env.CLOUDANT_URL);
  }
}
if(cloudant) {
  //database name
  dbName = 'mydb';

  // Create a new "mydb" database.
  cloudant.db.create(dbName, function(err, data) {
    if(!err) //err if database doesn't already exists
      console.log("Created database: " + dbName);
  });

  // Specify the database we are going to use (mydb)...
  mydb = cloudant.db.use(dbName);

  vendor = 'cloudant';
}

//serve static file (index.html, images, css)
app.use(express.static(__dirname + '/views'));

var port = process.env.PORT || 3000
app.listen(port, function() {
    console.log("To view your app, open this link in your browser: http://localhost:" + port);
});



const cron = require('node-cron');
// Schedule tasks to be run on the server.
cron.schedule('0 0 * * *', function() {
  var names = [];
  var dates = [];  
  //mydb.index( {name:'nameindex', type:'json', index:{fields:['date']}});
  mydb.list({ include_docs: true
    , descending: true
   }, function(err, body) {
    if (!err) {
      body.rows.forEach(function(row) {
        if(row.doc.payload)
          names.push(row.doc.payload);
          dates.push(row.doc.payload.date);
          //console.log('payload ', row.doc.payload);
          //console.log('names ', names);
      });

      (async () => {
        const response = await fetch('https://www.amp.co.nz/amp/returns-unit-prices/amp-new-zealand-retirement');
        const text = await response.text();
        //console.log(text);
        //var date = text.match(/(?<=\<p>Unit prices effective as at ).*(?=\<\/p>)/)[0].split("/").join('-')+'T00:00:00Z';
        //var date = text.match(/(?<=\<p>Unit prices effective as at ).*(?=\<\/p>)/)[0];
        var dateNZ = text.match(/(?<=\<p>Unit prices effective as at ).*(?=\<\/p>)/)[0].split("/");
        var date = dateNZ[2]+"-"+dateNZ[1]+"-"+dateNZ[0]+'T00:00:00Z';
        //console.log('asdfasfdsadf  fsdfdfdf   saddsf', date);
        //console.log('asdfsadffffffffff', dates.includes(date));        
        if(!dates.includes(date)) {
          var scraper = require('table-scraper');
          scraper
            .get('https://www.amp.co.nz/amp/returns-unit-prices/amp-new-zealand-retirement')
            .then(function(tableData) {
              //console.log(tableData[0][0]);
              //const result = tableData[0].find( ({ FUND }) => FUND === 'AMP Aggressive Fund' );
              //console.log(result[ 'UNIT PRICE ($)' ]) // { name: 'cherries', quantity: 5 }
              var output = {};
              var payload = {};
              var funds = [];
              var nikko={};
              var amp={};
              var asb={};
              var anz={};
              nikko.fund = "nikko";
              amp.fund = "amp";
              asb.fund = "asb";
              anz.fund = "anz";
              nikko.percent = 0.26;
              amp.percent = 0.25;
              asb.percent = 0.25;
              anz.percent = 0.24;
              nikko.price = tableData[0].find( ({ FUND }) => FUND === 'Nikko AM Growth Fund' )[ 'UNIT PRICE ($)' ];
              amp.price = tableData[0].find( ({ FUND }) => FUND === 'AMP Aggressive Fund' )[ 'UNIT PRICE ($)' ];
              asb.price = tableData[0].find( ({ FUND }) => FUND === 'ASB Growth Fund' )[ 'UNIT PRICE ($)' ];
              anz.price = tableData[0].find( ({ FUND }) => FUND === 'ANZ Growth Fund' )[ 'UNIT PRICE ($)' ];
              //console.log(anz.price) // { name: 'cherries', quantity: 5 }
              funds.push(nikko);
              funds.push(amp);
              funds.push(asb);
              funds.push(anz);
              payload.date = date;
              payload.funds = funds;
              output.payload = payload;
              var doc = JSON.parse(JSON.stringify(output));
              //console.log('sadfsdafsadfsdfsadfsadfsdf', JSON.stringify(payload));
              mydb.insert(doc, function(inserr, insbody, header) {
                if (inserr) {
                  console.log('[mydb.insert] ', inserr.message);
                }
              });
            });
        }
      })()
      //console.log('names ', names);      

      //return body.rows;
    }
  });
  console.log('running a task every 12am');
});

function functionName() {
  // function body
  // optional return; 
} 