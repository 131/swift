"use strict";

const path = require('path');
const readdir = require('nyks/fs/readdir');

const stripStart = require('nyks/string/stripStart');
const drain     = require('nyks/stream/drain');
const tar = require('tar-fs');
const bl  = require('bl');
const guid = require('mout/random/guid');

//construct an intermediate tar archive using tar-fs

class StorageUtils {
  static async create_chunked_tar(input_dir) {

    var uid = guid();
    var list = readdir(input_dir);
    var entries = [];

    for(let file_path of list)
      entries.push(stripStart(path.resolve(file_path), path.resolve(input_dir)).substr(1));

    var pack = tar.pack(input_dir, {
      entries   : entries,
      mapStream : function(fileStream, header) {
        var rs = bl([uid, header.name, "\0"]);
        //make tar-stream happy about size
        rs.on('end', function() {
          rs._readableState.pipes.written = header.size;
        });
        return rs;
      }
    });

    var contents = await drain(pack);
    //now, split intermediate tar parts & headers
    var parts = [];
    for(var i = 0; i < contents.length;) {
      let n = contents.indexOf(uid, i),
        end = contents.indexOf("\0", n);
      if(n == -1)
        break;
      parts.push(contents.slice(i, n));
      let file_path = contents.slice(n + uid.length, end).toString();
      parts.push({file_path});
      i = end + 1;
    }
    parts.push(contents.slice(i, contents.length));
    return parts;
  }

}

module.exports = StorageUtils;
