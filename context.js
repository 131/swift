"use strict";

const url    = require('url');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const ini    = require('ini');


const rtrim     = require('mout/string/rtrim');
const reindex   = require('nyks/collection/reindex');
const dive      = require('nyks/object/dive');
const request   = require('nyks/http/request');
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
      authURL :  'https://auth.cloud.ovh.net/v3',
      region :   'GRA',
      ...credentials
    };

    var json = { auth : {
      identity : {
        methods : ['password'],
        password : {
          user : {
            domain : {
              id : 'default'
            },
            name : config.username,
            password : config.password
          }
        }
      },
      scope : {
        project : {
          domain : {
            id : 'default'
          },
          name : config.tenantName,
          id : config.tenantId
        }
      }
    }};

    var endpoints;
    var headers;

    let renew = async () => {
      let query = {
        ...url.parse(config.authURL + '/auth/tokens'),
        headers :  { 'Accept' : 'application/json' },
        json : true,
      };

      var res = await request(query, json);
      if(!(res.statusCode >= 200 && res.statusCode < 300))
        throw `Invalid swift credentials`;


      var payload = JSON.parse(await drain(res));

      let token = res.headers['x-subject-token'];

      endpoints = dive(payload, 'token.catalog').reduce((full, catalog) => { //, k
        var publicUrl = dive(reindex(catalog.endpoints, 'region'), `${config.region}.url`);
        if(publicUrl)
          full[catalog.type]  = rtrim(publicUrl, '/');
        return full;
      }, {});

      headers = {
        "X-Auth-Token" : token,
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
      // always prefer account token over container specific, if available
      let secret = dive(this._auth, 'x-account-meta-temp-url-key') || dive(this._containerCache, container, 'headers.x-container-meta-temp-url-key');

      if(!secret)
        throw `Invalid container '${container}' configuration (missing secret key)`;
      return secret;
    };


    let auth = await request(query());
    if(auth.statusCode !== 200)
      throw `Cannot lookup auth infos`;

    let containers = JSON.parse(String(await drain(auth)));

    let ctx = {
      _query : query,
      _secret : secret,
      _endpoint : endpoint,
      _auth : auth.headers,
      renew,
    };

    for(let container of containers)
      container.headers = await Storage.showContainer(ctx, container.name);

    ctx._containerCache = containers.reduce((acc, val) => (acc[val.name] = val, acc), {});

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
