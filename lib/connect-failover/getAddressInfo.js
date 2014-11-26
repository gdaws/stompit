/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */

/*
 * stompit.Failover
 * Copyright (c) 2013-2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var assign = require('object-assign');

function getAddressInfo(args) {
  
  var info;
  
  if (typeof args.connect === 'function' && 
      typeof args.connect.getAddressInfo === 'function') {
    
    info = args.connect.getAddressInfo(args);
  }
  
  var hasPath = typeof args.path === 'string';
  var hasHost = typeof args.host === 'string';
  var hasPort = !isNaN(args.port);
  var hasSSL = args.ssl === true;
  
  var hasConnectHeaders = typeof args.connectHeaders === 'object';
  
  var login = hasConnectHeaders && args.connectHeaders.login;
  
  var hasHostHeader = hasConnectHeaders && 
    typeof args.connectHeaders.host === 'string' &&
    args.connectHeaders.host.length > 0;
  
  var transport;
  
  if (hasHost) {
    transport = hasSSL ? 'ssl' : 'tcp';
  }
  else if(hasPath) {
    transport = 'unix';
  }
  
  var pseudoUri = 'stomp+' + transport + '://';
  
  if (login) { 
    pseudoUri += login + '@';
  }
  
  var transportPath = '';
  
  if (hasHost) {
    transportPath += args.host;
  }
  else if(hasPath) {
    transportPath += args.path;
  }
  
  if (hasHost && hasPort) {
    transportPath += ':' + args.port;
  }
  
  pseudoUri += transportPath;
  
  if (hasHostHeader) {
    pseudoUri += '/' + args.connectHeaders.host;
  }
  
  return assign({
    
    connectArgs: args,
    
    transport: transport,
    transportPath: transportPath,
    
    path: args.path,
    
    host: args.host,
    port: args.port,
    
    pseudoUri: pseudoUri
    
  }, info || {});
}

module.exports = getAddressInfo;
