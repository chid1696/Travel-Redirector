const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const domain = require('domain');
const nodemailer = require('nodemailer');
const db = require('odbc');
const querystring = require('querystring');
const os = require('os');
const dateformat = require('dateformat');

const hostname = '127.0.0.1';
const port = 8519;

const smtpHost = 'smtprelay.ivhinc.net';
const smtpPort = '25';
const sourceEmail = 'service-soa@incresearch.com';
const supportAcct = 'tony.howard@syneoshealth.com';

const smtpConfig = {
  host: smtpHost,
  port: smtpPort,
  tls: {
    rejectUnauthorized: false
  }
};

var apiUser, apiPass, basicUser, basicPass, apiUrl;

const mailTransport = nodemailer.createTransport(smtpConfig);

var countryMap = { "CA" : "https://en.wikipedia.org/wiki/Canada",
			"US" : "https://en.wikipedia.org/wiki/United_States",
			"MX" : "https://en.wikipedia.org/wiki/Mexico" 
		};

//var errorURL = 'https://eshare.inventivhealth.com/sites/globaltravel/SitePages/Error%20Page.aspx';
var errorURL = 'https://synh.sharepoint.com/sites/GlobalTravel/SitePages/Error%20Page.aspx';
var dbString = 'DSN=SOACUST';

function findTravelSite(apiKey, req, res) {
//logMessage('finding travel site');
  var employeeId = req.headers.oam_employee_number;
  if (employeeId === 'workbotEmpNo' || employeeId === '0123456789') //Workbot / validator doesn't exist in salesforce, fake it
    employeeId = '132026';
  var country;
  var url = req.url;
  if (url.indexOf('?') > -1) {
    url = url.substring(url.indexOf("?") + 1);
    var params = querystring.parse(url);
    country = params.country;
  }
  if (typeof country === 'undefined')
    country = '';
  else
    country = '&countrycode=' + country;

  if (typeof employeeId === 'undefined') {
    logMessage('Error, could not read employee id');
    redirect(res, errorURL);
    return;
  }
  const options = {
    //hostname: 'apival.incresearch.com',
    //hostname: 'api.incresearch.com',
    //hostname: 'apiui.syneoshealth.om',
    hostname: apiUrl,
    port: 443,
    method: 'GET',
    path: '/employee/1.0.0/employee?employeeId=' + employeeId + country,
    headers: {
      Authorization: 'Bearer ' + apiKey,
      Accept: 'application/json'
      
    }
  };
  /*request = https.request(options, function(httpRes) {
    httpRes.on('data', function(data) {
        redirectCountry(data, req, res);
      })
    });
  request.on('error', function(data) {
       logMessage('Error while retrieving user country');
       logMessage(data.stack);
       redirect(res, errorURL);
    });
  request.end();*/
//        redirectCountry(data, req, res);
        redirectCountry(req, res);
}

function formatDate(date) {
  return dateformat(date, "yyyy-mm-dd hh:MM:ss.l");
}

function redirect(res, url) {
    res.writeHead(302, { 'Location': url });
    res.end();
}

//async function redirectCountry(countryJson, req, res) {
async function redirectCountry(req, res) {
//logMessage('country json: ' + countryJson);

  var countryInfo;
  //try {
  //  countryInfo = JSON.parse(countryJson);
  //} catch (err) {
    var employeeId = req.headers.oam_employee_number;
    if (employeeId === 'workbotEmpNo') //Workbot doesn't exist in salesforce, fake it
      employeeId = '132026';
    //logMessage('caught error ' + err);
    var connection = await db.connect(dbString);
    var rows = await connection.query('select distinct country_2char as country_code_2, country_descr as country, url from SOACUSTOM.PS_VPS_SOA_TBL a, bcd_travel_country_mapping b, bcd_travel_site_url c where emplid = ' + employeeId + ' and a.country_2char = b.country_code_2 and b.obt = c.obt order by 1');
    if (rows.length > 0) {
      countryInfo = new Object();
      countryInfo.Countries = new Object();
      countryInfo.Countries.Country = [];
      for (i = 0; i < rows.length; ++i) {
        var row = rows[i];
        var info = new Object();
        info.url = row.URL;
        info.country_code_2 = row.COUNTRY_CODE_2;
        info.country = row.COUNTRY;
        logMessage('User country ' + info.country_code_2 + ' url ' + info.url);
        countryInfo.Countries.Country.push(info);
      }
   // }
    await connection.close();
  }
  if (typeof countryInfo === 'undefined' || typeof countryInfo.Countries === 'undefined' || typeof countryInfo.Countries.Country == 'undefined' || typeof countryInfo.Countries.Country[0] === 'undefined') {
    var employeeId = req.headers.oam_employee_number;
    logMessage('Could not determine country for employee ' + employeeId + '.');
      redirect(res, errorURL);
    return;
  }
  //logMessage('url type ' + typeof countryInfo.Countries.Country[0].url + ' value ' + countryInfo.Countries.Country[0].url + ' no type ' + typeof countryInfo.Countries.Country[0].urle);
  if (typeof countryInfo.Countries.Country[0].url === 'undefined' || countryInfo.Countries.Country[0].url === null) {
    logMessage('Could not determine url for country ' + countryInfo.Countries.Country[0].country_code_2 + ' employee ' + req.headers.oam_employee_number);
    redirect(res, errorURL);
  }

logMessage('employee id ' + req.headers.oam_employee_number);

  redirect(res, countryInfo.Countries.Country[0].url);
}

async function redirectObt(res, obt) {
    var connection = await db.connect(dbString);
    var dbObt = "err";
    if (obt == "Cytric")
       dbObt = "Cytric";
    else if (obt == "TSPM")
       dbObt = "TSPM Direct";
    else if (obt == "Concur")
       dbObt = "Concur Travel";
    else if (obt == "Japan")
       dbObt = "Japan";
    else if (obt == "JapanLocal")
       dbObt = "JapanLocal";
    else if (obt == "JapanInt")
       dbObt = "JapanInt";
    if (dbObt == 'err') {
       logMessage('Invalid obt: ' + obt);
       redirect(res, errorURL);
       return;
    }
    var rows = await connection.query("select url from bcd_travel_site_url where obt = '" + dbObt + "'");
    var url;
    if (rows.length > 0) {
      url = rows[0].URL;
      await connection.close();
      redirect(res, url);
      return;
    }
    await connection.close();
    logMessage('Unable to determine url for ' + dbObt);
    redirect(res, errorURL);

}


function handleRedirect(req, res) {
  if (req.url.indexOf("obt/") != -1) {
    obt = req.url.substring(req.url.indexOf("obt/") + 4);
    redirectObt(res, obt);
    return;
  }
//logMessage('getting api key');
  //getDataAPIKey(req, res, findTravelSite);
  findTravelSite(null, req, res);
}

function getDataAPIKey(req, res, keyHandler) {
  //Get these from db
  //var appUser = 'O4gNfa84JTixGBPFKhFMRe74gXAa';
  //var appPass = '_TZiY9eSicsQO9wvfJfkwW28sp8a';

  var body = 'username=' + apiUser + '&password=' + apiPass + '&grant_type=client_credentials';
  const options = {
    //hostname: 'apiui.syneoshealth.com',
    //hostname: 'apival.incresearch.com',
    //hostname: 'api.incresearch.com',
    hostname: apiUrl,
    method: 'POST',
    path: '/token',
    port: '443',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(basicUser + ':' + basicPass).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  };
//logMessage('building request url ' + apiUrl);
  var request = https.request(options, function(httpRes) {
      httpRes.on('data', function(data) {
logMessage('got api data key ' + data + ' basic user ' + basicUser + ' pass ' + basicPass + ' body user ' + apiUser + ' pass ' + apiPass );
         keyHandler(JSON.parse(data).access_token, req, res);
      });
    });

//logMessage('finishing request');
  request.on('error', function(data) {
       logMessage('something went wrong getDataAPIKey ' + data);
       redirectCountry('error', req, res);
    });
//  request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
 // request.setHeader('Content-Length', Buffer.byteLength(body));
logMessage('sending request');
  request.write(body);
  request.end();
logMessage('request sent');
}

function logMessage(msg) {
  console.log(formatDate(new Date()) + ': ' + msg);
}

function reportError(sub, msg) {
  msg = os.hostname() + ': ' + formatDate(new Date) + '\n\n' + msg;
  var message = {
    from: sourceEmail,
    to: supportAcct,
    subject: sub,
    text: msg
  }
  mailTransport.sendMail(message).then(info=> { logMessage('mail sent')});
}

async function initParams() {
  var connection = await db.connect(dbString);
  var rows = await connection.query( "select property_name, value from service_config where service_name = 'APIToken'");

  for (i = 0; i < rows.length; ++i) {
    var row = rows[i];
    if (row.PROPERTY_NAME === 'username')
      apiUser = row.VALUE;
    else if (row.PROPERTY_NAME === 'password')
      apiPass = row.VALUE;
    else if (row.PROPERTY_NAME === 'basic.user.emp')
      basicUser = row.VALUE;
    else if (row.PROPERTY_NAME === 'basic.pass.emp')
      basicPass = row.VALUE;
    else if (row.PROPERTY_NAME === 'BaseURL')
      apiUrl = row.VALUE;
  }
  if (apiUrl.indexOf('/token') > -1)
    apiUrl = apiUrl.substring(8, apiUrl.indexOf('/token'));
  if (apiUrl.indexOf('://') > -1)
    apiUrl = apiUrl.substring(apiUrl.indexOf('://') + 3);
  apiUrl = apiUrl.replace('syneoshealth', 'incresearch');

  await connection.close()
  const server = http.createServer(runServer);
  server.listen(port, "0.0.0.0", () => {
    logMessage('server running at port ' + port);
  });
}


function runServer(req, res) {
  //Check req url
  //Get handler for url
  //handler.handleRedirect()
  const d = domain.create();
  d.on('error', (err) => {
    logMessage(err.stack);
    reportError('Syneos Health Redirect: unexpected error processing redirect', err.stack);
    redirect(res, errorURL);
  });
  d.add(req);
  d.add(res);
  d.run(() => {
    handleRedirect(req, res);
  });

}

try {
  initParams();
}  catch (err) {
     logMessage(err.stack);
}
//};
