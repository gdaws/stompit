/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

function getAddressInfo(args) {
  
  let info;
  
  if (typeof args.connect === 'function' && 
      typeof args.connect.getAddressInfo === 'function') {
    
    info = args.connect.getAddressInfo(args);
  }
  
  const hasPath = typeof args.path === 'string';
  const hasHost = typeof args.host === 'string';
  const hasPort = !isNaN(args.port);
  const hasSSL = args.ssl === true;
  
  const hasConnectHeaders = typeof args.connectHeaders === 'object';
  
  const login = hasConnectHeaders && args.connectHeaders.login;
  
  const hasHostHeader = hasConnectHeaders && 
    typeof args.connectHeaders.host === 'string' &&
    args.connectHeaders.host.length > 0;
  
  let transport;
  
  if (hasHost) {
    transport = hasSSL ? 'ssl' : 'tcp';
  }
  else if(hasPath) {
    transport = 'unix';
  }
  
  let pseudoUri = 'stomp+' + transport + '://';
  
  if (login) { 
    pseudoUri += login + '@';
  }
  
  let transportPath = '';
  
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
  
  return Object.assign({
    
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
