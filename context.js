"use strict";

const url    = require('url');

const get       = require('mout/object/get');
const rtrim     = require('mout/string/rtrim');
const reindex   = require('nyks/collection/reindex');

const promisify = require('nyks/function/promisify');
const request   = promisify(require('nyks/http/request'));
const drain     = require('nyks/stream/drain');

const debug  = require('debug');

const log = {
  debug : debug('swift:debug'),
  info  : debug('swift:info'),
  error : debug('swift:error'),
};



class Context  {

  static async build(credentials) {
    var config = {
      authURL :  'https://auth.cloud.ovh.net/v2.0',
      region :   'GRA3',
      ...credentials
    };

    var json = {
      auth : {
        passwordCredentials : {
          username : config.username,
          password : config.password
        },
        tenantId : config.tenantId
      }
    };

    var query = {
      ...url.parse(config.authURL + '/tokens'),
      headers :  { 'Accept' : 'application/json' },
      json : true,
    };

    var res = await request(query, json);
    var payload = JSON.parse(await drain(res));


    var token           = get(payload, 'access.token');
    var endpoints = get(payload, 'access.serviceCatalog').reduce((full, catalog) => { //, k
      var publicUrl = get(reindex(catalog.endpoints, 'region'), `${config.region}.publicURL`);
      if(publicUrl)
        full[catalog.type]  = rtrim(publicUrl, '/') + '/'; //enforce trailing /
      return full;
    }, {});

    var endpoint = (what, path) => {
      if(!endpoints[what])
        throw `Cannot lookup endpoint for service '${what}'`;
      return url.resolve(endpoints[what], path);
    };

    var headers  = {
      "X-Auth-Token" : token.id,
      "Accept" : "application/json"
    };

    query = (what, path, xtra) => {
      var target = {...url.parse(endpoint(what, path)), ...xtra};
      target.headers  = {...headers, ...target.headers};
      log.debug("Query", target);
      return target;
    };

    let containerCache = {};
    return {token, endpoints, endpoint, headers, query, containerCache};
  }

}

module.exports = Context;
