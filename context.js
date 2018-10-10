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

  static async build_containers(credentials) {

    var config = {
      ...credentials
    };

    let secret = async function(Storage, container) {
      let bundled = get(config, `containers.${container}.temp-url-key`);
      if(bundled)
        return bundled;

      throw `Invalid container '${container}' configuration (missing secret key)`;
    };


    var headers  = {
      "Accept" : "application/json"
    };

    var endpoint = (container, filename) => {
      let dst = get(config, `containers.${container}.endpoint`);
      if(!dst)
        throw `Cannot lookup endpoint for container '${container}'`;
      if(!filename)
        throw `Cannot work on non filename in container mode`;
      return  `${dst}/${filename}`;
    };


    let query = (xtra, container, filename) => {
      var target = {...url.parse(endpoint(container, filename)), ...xtra};
      target.headers  = {...headers, ...target.headers};
      log.debug("Query", target);
      return target;
    };

    return {_query : query, _secret : secret};
  }


  static async build(credentials) {

    if(credentials.containers)
      return Context.build_containers(credentials);


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
        full[catalog.type]  = rtrim(publicUrl, '/');
      return full;
    }, {});

    var what = 'object-store';

    var endpoint = (container, filename) => {
      if(!endpoints[what])
        throw `Cannot lookup endpoint for service '${what}'`;

      var dst = endpoints[what] + "/" + container;
      if(filename)
        dst += "/" + filename;
      return dst;
    };

    var headers  = {
      "X-Auth-Token" : token.id,
      "Accept" : "application/json"
    };

    query = (xtra, container, filename) => {
      var target = {...url.parse(endpoint(container, filename)), ...xtra};
      target.headers  = {...headers, ...target.headers};
      log.debug("Query", target);
      return target;
    };

    let containerCache = {};

    let secret = async function(Storage, container) {
      if(!containerCache[container])
        containerCache[container] = await Storage.showContainer(this, container);

      let secret = containerCache[container]['x-container-meta-temp-url-key'];


      if(!secret)
        throw `Invalid container '${container}' configuration (missing secret key)`;
      return secret;
    };

    return {_query : query, _secret : secret};
  }

}

module.exports = Context;