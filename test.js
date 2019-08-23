"use strict";


const Context = require('./context');
const Storage = require('./storage');


class foo {

  async run() {
    var creds = Context.read_rclone("thecube");
    var ctx = await Context.build(creds);

    //    var temp = await Storage.getFileList(ctx, "Movies");
    //    return temp;

    let tmp = await Storage.head(ctx, "Movies", "rep-avengersinfinitywar.2018.720p.bluray.x264.sr");
    console.log(tmp);
    //    return tmp;
  }


}


module.exports = foo;

