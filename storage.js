'use strict';

const fs   = require('fs');
const url  = require('url');


const promisify = require('nyks/function/promisify');
const prequest  = promisify(require('nyks/http/request'));
const drain     = require('nyks/stream/drain');
const hmac = require('nyks/crypto/hmac');
const encode = require('querystring').encode;
const decode = require('querystring').decode;
const debug  = require('debug');


const log = {
  debug : debug('swift:debug'),
  info  : debug('swift:info'),
  error : debug('swift:error'),
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

class Storage {


  static async createContainer(ctx, container) {
    var query = await ctx._query({
      method :   'PUT',
    }, container);

    var res = await request(query);
    await drain(res);
    return res.headers;
  }


  static async download(ctx, container, filename, xtra) {
    var query = await ctx._query(xtra, container, encodeURIComponent(filename));
    var res = await request(query);
    return res;
  }

  static async put(ctx, container, filename, xtra) {
    var query = await ctx._query({method : 'PUT', ...xtra}, container, encodeURIComponent(filename));
    var res = await request(query);
    return res;
  }


  static async head(ctx, container, filename) {
    return this.download(ctx, container, filename, {
      method :   'HEAD'
    });
  }

  static async update(ctx, container, filename, xtra) {
    var query = await ctx._query({method : 'POST', ...xtra}, container, encodeURIComponent(filename));
    var res = await request(query);
    return res;
  }

  static async putFile(ctx, localfile, container, filename, headers) {
    log.info("putFile %s to %s", localfile, container, filename, headers);
    var stream = fs.createReadStream(localfile);
    return Storage.putStream(ctx, stream, container, filename, headers);
  }


  //mostly sync, but we might need to lookup the container key
  static async tempURL(ctx, container, filename, method, duration) {

    if(!duration)
      duration = 86400;

    let secret = await ctx._secret(container);

    let dst = ctx._endpoint(container, filename);
    let expires = Math.floor(Date.now() / 1000 + duration);
    //pathname does not contains querystring
    let hmac_body = [method || 'GET', expires, decodeURIComponent(dst.pathname)].join("\n");

    var sig = hmac('sha1', secret, hmac_body);

    dst.search = encode({...decode(dst.query), temp_url_sig : sig, temp_url_expires : expires});
    return url.format(dst);
  }


  static async putStream(ctx, stream, container, filename, headers) {
    if(typeof headers == "string")
      headers = { etag : headers };

    log.info("putStream to", filename, headers);
    var query = await ctx._query({
      method :   'PUT',
      headers,
    }, container, encodeURIComponent(filename));
    var res = await request(query, stream);
    await drain(res);
    return res.headers;
  }


  static async deleteFile(ctx, container, filename) {
    var query = await ctx._query({
      method :   'DELETE',
    }, container, encodeURIComponent(filename));
    var res = await request(query);
    await drain(res);
    return res.headers;
  }

  static async updateContainer(ctx, container, headers) {
    var query = await ctx._query({method : 'POST', headers}, container);

    var res = await request(query);
    await drain(res); //make sure to close
    return res.headers;
  }

  static async toggleMode(ctx, container, mode) {
    return Storage.updateContainer(ctx, container, {'X-Container-Read' : mode});
  }


  static async tempKey(ctx, container, key) {
    return Storage.updateContainer(ctx, container, {'X-Container-Meta-Temp-URL-Key' : key});
  }


  static async getFileList(ctx, container, prefix = "") {
    var query = await ctx._query({}, container, "?" + encode({prefix}));
    var res  = await request(query);
    var body = JSON.parse(await drain(res));
    return body;
  }



  static async showContainer(ctx, container) {
    var query = await ctx._query({
      method :   'HEAD',
    }, container);

    var res = await request(query);
    await drain(res); //make sure to close
    return res.headers;
  }

}

module.exports = Storage;
