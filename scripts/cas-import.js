"use strict";

//const fs = require('fs');
const sprintf = require('util').format;
const path   = require('path');
const crypto = require('crypto');

const eachLimit = require('nyks/async/eachLimit');
const pipe = require('nyks/stream/pipe');
const shuffle = require('mout/array/shuffle');
const md5     = require('nyks/crypto/md5');

const bl = require('bl');

const sleep = require('nyks/async/sleep');
const SContext = require('swift/context');
const Storage = require('swift/storage');
const ProgressBar = require('progress');

/**
Import a NON cas designed object storage
into a CAS one

**/

const LO_ETAG  = 'x-object-meta-lo-etag';
const DLO_HEADER  = 'x-object-manifest';

const EMPTY_HASH = "d41d8cd98f00b204e9800998ecf8427e";
const MIME_FILE  = "application/octet-stream";
const MIME_LARGE = "application/large-file";


class foo {

  async run(src_creds, dst_creds, src_container, dst_container, nbthreads) /*
  * @param {number} [nbthreads=5]
  */ {

    console.log("Building rclone contexts");
    src_creds   = SContext.read_rclone(src_creds);
    let src_ctx = await SContext.build(src_creds);
    let dst_ctx = await SContext.build(SContext.read_rclone(dst_creds));

    if(!Array.isArray(src_container))
      src_container = [src_container];

    console.log("Listing remote blocks in %s", dst_container);
    let dst_list = await Storage.getFileList(dst_ctx, dst_container);
    dst_list = dst_list.map(entry => path.basename(entry.name));
    console.log("remote %s has %d blocks", dst_container, dst_list.length);
    let src_list = [];
    for(let container of src_container) {
      let tmp = await Storage.getFileList(src_ctx, container);
      tmp.forEach(entry => entry.container = container);
      src_list.push(...tmp);
      src_list = shuffle(src_list);
    }

    let push_dlo = async (entry) => {
      if(!entry.headers[LO_ETAG])
        await this._compute_lo_etag(src_ctx, entry);

      let manifest_hash = entry.headers[LO_ETAG];
      if(dst_list.indexOf(manifest_hash) != -1)
        return;

      console.log("Pushing", entry);
      let [container, ...filepath] = decodeURIComponent(entry.headers[DLO_HEADER]).split('/');
      filepath = filepath.join('/');

      let parts_list = await Storage.getFileList(src_ctx, container, encodeURIComponent(filepath));
      //create SLO with all that  \o/
      let manifest_name = sprintf("%s/%s/%s", manifest_hash.substr(0, 2), manifest_hash.substr(2, 1), manifest_hash);
      let manifest = parts_list.map(({hash, bytes}) => ({
        "path"       : path.join(dst_container, sprintf("%s/%s/%s", hash.substr(0, 2), hash.substr(2, 1), hash)),
        "size_bytes" : bytes,
        "etag"       : hash,
      }));

      var etag = md5(manifest.map(line => line.etag).join(''));
      var remote_url = `${manifest_name}?multipart-manifest=put`;
      await Storage.putStream(dst_ctx, bl(JSON.stringify(manifest)), dst_container, remote_url, {etag});

      let headers = {'content-type' :  MIME_LARGE};
      await Storage.update(dst_ctx, dst_container, manifest_name, {headers});

      console.log({manifest_name, manifest});
    };

    let push_file = async (entry) => {
      let md5_hash = entry.headers['etag'];
      if(dst_list.indexOf(md5_hash) != -1)
        return;

      let dst_name = sprintf("%s/%s/%s", md5_hash.substr(0, 2), md5_hash.substr(2, 1), md5_hash);

      let headers = {};
      headers['x-copy-from'] = path.join(entry.container, encodeURIComponent(entry.name));
      headers['x-copy-from-account'] = sprintf("AUTH_%s", src_creds.tenantId);
      console.log("Pushing", entry.name);

      try {
        await Storage.put(dst_ctx, dst_container, dst_name, {headers});
      } catch(err) {
        if(err.res.statusCode != 504)
          throw err;

        let tries = 6 * 10;
        do {
          console.log("WAITING A BIT FOR %s to appear", md5_hash);
          try {
            await Storage.head(dst_ctx, dst_container, dst_name);
            break;
          } catch(err) {
            if(err.res.statusCode != 404)
              throw err;
            await sleep(10 * 1000);
          }
        } while(tries-- > 0);

        if(tries <= 0)
          throw ` Cannot fetch ${md5_hash}`;
      }

      headers = {'content-type' :  MIME_FILE};
      await Storage.update(dst_ctx, dst_container, dst_name, {headers});
    };

    console.log("Got %d files to check, (%d threads)", src_list.length, nbthreads);

    await eachLimit(src_list, nbthreads, async (entry) => {
      try {
        if(dst_list.indexOf(entry.hash) != -1 && entry.hash != EMPTY_HASH)
          return;

        let {headers} = await Storage.head(src_ctx, entry.container, encodeURIComponent(entry.name));
        entry.headers = headers;

        if(entry.headers[DLO_HEADER])
          await push_dlo(entry);
        else
          await push_file(entry);
      } catch(err) {
        console.log("Err", err);
        process.exit();
      }
    });
  }


  async _compute_lo_etag(ctx, entry) {
    let size = Number(entry.headers['content-length']);
    console.log("Now computing hash for", entry);
    let res = await Storage.download(ctx, entry.container, encodeURIComponent(entry.name));
    let hash = crypto.createHash('md5');
    var bar = new ProgressBar("[:bar] :percent :etas", {total : size, width : 60, incomplete : ' ', clear : true});
    res.on('data', buf => bar.tick(buf.length));
    await pipe(res, hash);
    let headers =  {[LO_ETAG] : hash.read().toString('hex')};
    headers[DLO_HEADER] = res.headers[DLO_HEADER]; //preserve DLO_HEADER
    await Storage.update(ctx, entry.container, encodeURIComponent(entry.name), {headers});
    entry.headers = {...entry.headers, ...headers};
  }

}

module.exports = foo;
