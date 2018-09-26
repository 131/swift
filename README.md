Openstack *swift* client API with ES7 async/await design.


[![NPM Version](https://img.shields.io/npm/v/swift.svg?style=flat)](https://www.npmjs.org/package/swift)
[![Build Status](https://img.shields.io/travis/131/swift.svg?style=flat)](http://travis-ci.org/131/swift)
[![Coverage Status](https://img.shields.io/coveralls/131/swift.svg?style=flat)](https://coveralls.io/r/131/swift?branch=master)




# Installation

```bash
$ npm install swift
```


# API/services

## object-store
```js
"use strict";

const fs      = require('fs');
const Context = require('swift/context');
const storage = require('swift/services/object-store');

const pipe    = require('nyks/stream/pipe');
const creds   = require('./credentials');


class foo {
  async run(){
    // init token
    var ctx = await Context.build(creds);

    var files = await storage.toggleMode(ctx, 'mediaprivate', ".r:*,.rlistings");
    var headers = await storage.showContainer(ctx, 'mediaprivate');


    var remote = await storage.putFile(ctx, 'boucs.jpg', 'mediaprivate/bouc.jpg');
    var local = fs.createWriteStream('tmp.jpg');

    var remote = storage.download(ctx, 'mediaprivate/bouc.jpg');

    await pipe(remote, local);

    var remote = await storage.deleteFile(ctx, 'mediaprivate/bouc.jpg');

    var files = await storage.getFileList(ctx, 'mediaprivate');
    console.log({files, remote});
  }
}


module.exports = foo;
```


