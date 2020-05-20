Openstack *swift* client API with ES7 async/await design.


[![NPM Version](https://img.shields.io/npm/v/swift.svg?style=flat)](https://www.npmjs.org/package/swift)
[![Build Status](https://img.shields.io/travis/131/swift.svg?style=flat)](http://travis-ci.org/131/swift)
[![Coverage Status](https://img.shields.io/coveralls/131/swift.svg?style=flat)](https://coveralls.io/r/131/swift?branch=master)




# Installation

```bash
$ npm install swift
```


# API/services (auth3)
Auth3 API will login to your openstack and use a X-Auth-Token in all operations.
Make sure to renew (setInterval) the auth token periodicaly.

## credentials
```js
"use strict";

module.exports = {
    authUrl : "https://auth.cloud.ovh.net/v3", // default "https://auth.cloud.ovh.net/v2.0"
    keystoneV3 : true, // default false
    username : "OpenstackUsername", // required
    password : "OpenstackPassword", // required
    tenantId : "OpenstackProjectId", // one of tenantId or tenantName is required
    tenantName : "OpenstackProjectName", // one of tenantId or tenantName is required
    region: "WAW", // default "GRA3"
};

```


## object-store 
```js
"use strict";

const fs      = require('fs');
const Context = require('swift/context');
const storage = require('swift/storage');

const pipe    = require('nyks/stream/pipe');
const creds   = require('./credentials');



class foo {
  async run(){
    // init token

    let container = 'mediaprivate';

    var ctx = await Context.build(creds);

    var files = await storage.toggleMode(ctx, container, ".r:*,.rlistings");
    var headers = await storage.showContainer(ctx, container);


    var remote = await storage.putFile(ctx, 'boucs.jpg', container, 'bouc.jpg');
    var local = fs.createWriteStream('tmp.jpg');

    var remote = storage.download(ctx, container, 'bouc.jpg');

    await pipe(remote, local);

    var remote = await storage.deleteFile(ctx, container, 'bouc.jpg');

    var files = await storage.getFileList(ctx, container);
    console.log({files, remote});
  }
}


module.exports = foo;
```


# API/services (meta-temp-url-key)
Using a container meta-temp key, you can upload, retrieve or delete specific files in your container.
On a CAS designed container, this should be considered as a best practice against a full container access.

## object-store 
```js
"use strict";

const fs      = require('fs');
const Context = require('swift/context');
const storage = require('swift/storage');

const pipe    = require('nyks/stream/pipe');
const creds   = {
 "containers" : {

    "mediaprivate" : {
        "endpoint"     : "https://someopenstackswifthost/v1/AUTH_PROJECTID/mediaprivate",
        "temp-url-key" : "somesecret",
    }
 }

};


class foo {
  async run(){

    let container = 'mediaprivate';


    // does not init token, as no username is provided
    var ctx = await Context.build(creds);

    //please note that container level API won't work
    //var files = await storage.toggleMode(ctx, container, ".r:*,.rlistings");
    //var headers = await storage.showContainer(ctx, container);


    var remote = await storage.putFile(ctx, 'boucs.jpg', container, 'bouc.jpg');
    var local = fs.createWriteStream('tmp.jpg');

      //download through tempURL
    var remote = storage.download(ctx, container, 'bouc.jpg');

    await pipe(remote, local);

    var remote = await storage.deleteFile(ctx, container, 'bouc.jpg');

    var files = await storage.getFileList(ctx, container);
    console.log({files, remote});
  }
}


module.exports = foo;
```







