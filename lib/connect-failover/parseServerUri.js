/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

function parseServerUri(uri) {
  
  const comps = uri.match(
    /^\s*((\w+):\/\/)?(([^:]+):([^@]+)@)?([\w-.]+)(:(\d+))?\s*$/
  );
  
  if (!comps) {
    throw new Error('could not parse server uri \'' + uri + '\'');
  }
  
  const scheme   = comps[2];
  const login    = comps[4];
  const passcode = comps[5];
  const hostname = comps[6];
  const port     = comps[8];
  
  const server = {
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
