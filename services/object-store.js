'use strict';

const path = require('path');
const fs   = require('fs');
const url  = require('url');


const promisify = require('nyks/function/promisify');
const prequest  = promisify(require('nyks/http/request'));
const drain     = require('nyks/stream/drain');
const hmac = require('nyks/crypto/hmac');
const encode = require('querystring').encode;
const debug  = require('debug');

const log = {
  debug : debug('swift:object-store:debug'),
  info  : debug('swift:object-store:info'),
  error : debug('swift:object-store:error'),
};


const request = async (...args) => {
  try {
    return await prequest(...args);
  } catch(err) {
    if(err.res)
      err.res = {message : String(await drain(err.res)), headers : err.res.headers, statusCode : err.res.statusCode};
    throw err;
  }
};

class OVHStorage {


  static async createContainer(ctx, container) {
    var query = ctx.query('object-store', container, {
      method :   'PUT',
    });

    var res = await request(query);
    await drain(res);
    return res.headers;
  }


  static async download(ctx, path, xtra) {
    var query = ctx.query('object-store', path, xtra);
    var res = await request(query);
    return res;
  }

  static async putFile(ctx, localfile, path, headers) {
    log.info("putFile %s to %s", localfile, path, headers);
    var stream = fs.createReadStream(localfile);
    return OVHStorage.putStream(ctx, stream, path, headers);
  }


  //mostly sync, but we might need to lookup the container key
  static async tempURL(ctx, container, file_path, method, duration) {

    if(!ctx.containerCache[container])
      ctx.containerCache[container] = await OVHStorage.showContainer(ctx, container);

    if(!duration)
      duration = 86400;

    let secret = ctx.containerCache[container]['x-container-meta-temp-url-key'];

    if(!secret)
      throw `Invalid container '${container}' configuration (missing secret key)`;

    let dst = ctx.query('object-store', path.join(container, file_path));
    let expires = Math.floor(Date.now() / 1000 + duration);

    let hmac_body = [method || 'GET', expires, decodeURIComponent(dst.path)].join("\n");

    var sig = hmac('sha1', secret, hmac_body);

    dst.search = encode({temp_url_sig : sig, temp_url_expires : expires});
    return url.format(dst);
  }


  static async putStream(ctx, stream, path, headers) {
    if(typeof headers == "string")
      headers = { etag : headers };

    log.info("putStream to", path, headers);
    var query = ctx.query('object-store', path, {
      method :   'PUT',
      headers,
    });
    var res = await request(query, stream);
    await drain(res);
    return res.headers;
  }


  static async deleteFile(ctx, path) {
    var query = ctx.query('object-store', path, {
      method :   'DELETE',
    });
    var res = await request(query);
    await drain(res);
    return res.headers;
  }

  static async updateContainer(ctx, container, headers) {
    var query = ctx.query('object-store',  container, {method : 'POST', headers});

    var res = await request(query);
    await drain(res); //make sure to close
    return res.headers;
  }

  static async toggleMode(ctx, container, mode) {
    return OVHStorage.updateContainer(ctx, container, {'X-Container-Read' : mode});
  }


  static async tempKey(ctx, container, key) {
    return OVHStorage.updateContainer(ctx, container, {'X-Container-Meta-Temp-URL-Key' : key});
  }


  static async getFileList(ctx, container) {
    var query = ctx.query('object-store',  container);
    var res  = await request(query);
    var body = JSON.parse(await drain(res));
    return body;
  }



  static async showContainer(ctx, container) {
    var query = ctx.query('object-store',  container, {
      method :   'HEAD',
    });

    var res = await request(query);
    await drain(res); //make sure to close
    return res.headers;
  }

}

module.exports = OVHStorage;
