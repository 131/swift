"use strict";

const url    = require('url');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const ini    = require('ini');


const rtrim     = require('mout/string/rtrim');
const reindex   = require('nyks/collection/reindex');
const dive      = require('nyks/object/dive');
const promisify = require('nyks/function/promisify');
const request   = promisify(require('nyks/http/request'));
const drain     = require('nyks/stream/drain');

const debug  = require('debug');

const log = {
  debug : debug('swift:debug'),
  info  : debug('swift:info'),
  error : debug('swift:error'),
};

const Storage = require('./storage');

class Context  {

  static async build_containers(credentials) {

    var config = {
      ...credentials
    };
    let agent = new https.Agent({ keepAlive : true });

    let secret = function(container) {
      let bundled = dive(config, 'containers', container, 'temp-url-key');
      if(bundled)
        return bundled;

      throw `Invalid container '${container}' configuration (missing secret key)`;
    };


    var headers  = {
      "Accept" : "application/json"
    };

    var endpoint = (container, filename) => {
      let dst = dive(config, 'containers', container, 'endpoint');
      if(!dst)
        throw `Cannot lookup endpoint for container '${container}'`;
      if(!filename)
        throw `Cannot work on non filename in container mode`;
      return  url.parse(`${dst}/${filename}`);
    };


    let query = function(xtra, container, filename) {
      let tmpurl = Storage.tempURL(this, container, filename, xtra && xtra.method);
      var target = {agent, ...url.parse(tmpurl), ...xtra};
      target.headers  = {...headers, ...target.headers};

      log.debug("Query", target);
      return target;
    };

    return {_query : query, _secret : secret, _endpoint : endpoint};
  }


  static async build(credentials) {

    let agent = new https.Agent({ keepAlive : true });

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

    var endpoints;
    var headers;

    let renew = async () => {
      let query = {
        ...url.parse(config.authURL + '/tokens'),
        headers :  { 'Accept' : 'application/json' },
        json : true,
      };

      try {
        var res = await request(query, json);
        var payload = JSON.parse(await drain(res));
      } catch(err) {
        throw `Invalid swift credentials`;
      }

      let token = dive(payload, 'access.token');
      endpoints = dive(payload, 'access.serviceCatalog').reduce((full, catalog) => { //, k
        var publicUrl = dive(reindex(catalog.endpoints, 'region'), `${config.region}.publicURL`);
        if(publicUrl)
          full[catalog.type]  = rtrim(publicUrl, '/');
        return full;
      }, {});

      headers = {
        "X-Auth-Token" : token.id,
        "Accept" : "application/json"
      };
    };

    await renew(); //init stuffs

    var what = 'object-store';

    var endpoint = (container, path) => {
      if(!endpoints[what])
        throw `Cannot lookup endpoint for service '${what}'`;

      var dst = endpoints[what];
      if(container)
        dst += "/" + container;
      if(path)
        dst += "/" + path;
      return url.parse(dst);
    };


    let query = (xtra, container, path) => {
      var target = {agent, ...endpoint(container, path), ...xtra};
      target.headers  = {...headers, ...target.headers};
      log.debug("Query", target);
      return target;
    };


    let secret = function(container) {
      if(!this._containerCache[container])
        throw `Invalid container '${container}' configuration (missing secret key)`;

      let secret = dive(this._containerCache, container, 'headers.x-container-meta-temp-url-key');

      if(!secret)
        throw `Invalid container '${container}' configuration (missing secret key)`;
      return secret;
    };

    let ctx = {_query : query, _secret : secret, _endpoint : endpoint, renew};

    ctx._containerCache = await Storage.listContainers(ctx);
    return ctx;
  }


  //parse an existing rclone configuration file
  static read_rclone(section) {
    var config = {};

    var local_config = path.join(process.env.HOME || process.env.USERPROFILE, '.config/rclone/rclone.conf');
    if(!fs.existsSync(local_config))
      return config;
    local_config = fs.readFileSync(local_config, 'utf8');
    local_config = ini.parse(local_config);

    for(let key in local_config) {
      let block = local_config[key];
      if(block.type != 'swift')
        continue;
      config[key] = {
        "username" : block.user,
        "password" : block.key,
        "tenantId" : block.tenant_id,
        "region"   : block.region,
      };
    }

    return section ? config[section] : config;
  }

}

module.exports = Context;
