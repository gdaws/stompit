/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */

/*
 * stompit.Failover
 * Copyright (c) 2013-2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

function parseServerUri(uri) {
  
  var comps = uri.match(
    /^\s*((\w+):\/\/)?(([^:]+):([^@]+)@)?([\w-.]+)(:(\d+))?\s*$/
  );
  
  if (!comps) {
    throw new Error('could not parse server uri \'' + uri + '\'');
  }
  
  var scheme   = comps[2];
  var login    = comps[4];
  var passcode = comps[5];
  var hostname = comps[6];
  var port     = comps[8];
  
  var server = {
    host: hostname,
    connectHeaders: {}
  };
  
  if (scheme !== void 0) {
    server.ssl = scheme === 'ssl' || scheme === 'stomp+ssl';
  }
  
  if (port !== void 0) {
    server.port = parseInt(port, 10);
  }
  
  if (login !== void 0) {
    server.connectHeaders.login = login;
  }
  
  if (passcode !== void 0) {
    server.connectHeaders.passcode = passcode;
  }
  
  if (scheme === 'unix' || hostname[0] === '/') {
    
    if (port !== void 0) {
      throw new Error('invalid server uri \'' + uri + '\'');
    }
    
    server.path = hostname;
    server.ssl = false;
  }
  
  return server;
}

module.exports = parseServerUri;
