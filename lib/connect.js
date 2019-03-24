/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const net = require('net');
const tls = require('tls');
const Client = require('./Client');

/*
 * Connect to a server and establish a STOMP session.
 */
function connect() {
  
  const args = normalizeConnectArgs(arguments);
  
  const options = {
    
    host: 'localhost',
    port: 61613,
    timeout: 3000,
    connectHeaders: {},

    ...args[0]
  };
  
  const connectListener = args[1];
  
  let client = null;
  let socket = null;
  let timeout = null;
  let originalSocketDestroy = null;
  
  const cleanup = function() {
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    client.removeListener('error', onError);
    client.removeListener('connect', onConnected);
  };
  
  const onError = function(error) {
    
    cleanup();
    
    error.connectArgs = options;
    
    if (typeof connectListener === 'function') {
      connectListener(error);
    }
  };
  
  const onConnected = function() {
    
    if (originalSocketDestroy) {
      socket.destroy = originalSocketDestroy;
    }
    
    cleanup();
    
    client.emit('socket-connect');
    
    const connectOpts = Object.assign(
      {host: options.host}, 
      options.connectHeaders
    );
    
    client.connect(connectOpts, connectListener);
  };
  
  let transportConnect = net.connect;
  
  if ('connect' in options) {
    transportConnect = options.connect;
  }
  else{
    if ('ssl' in options) {
      if (typeof options.ssl === 'boolean') {
        if (options.ssl === true) {
          transportConnect = tls.connect;
        }
      }
      else{
        if (options.ssl !== void 0) {
          throw new Error('expected ssl property to have boolean value');
        }
      }
    }
  }
  
  socket = transportConnect(options, onConnected);

  if (options.timeout > 0) {

    timeout = setTimeout(function() {
      client.destroy(client.createTransportError('connect timed out'));
    }, options.timeout);

    originalSocketDestroy = socket.destroy;

    socket.destroy = function() {
      clearTimeout(timeout);
      socket.destroy = originalSocketDestroy;
      originalSocketDestroy.apply(socket, arguments);
    };
  }

  client = new Client(socket, options);
  
  client.on('error', onError);
  
  return client;
}

function isPositiveInteger(value) {
  
  const type = typeof value;
  
  return (type == 'number' && value >= 0 && Math.round(value) === value) || 
         (type == 'string' && value.match(/\d+/) !== null);
}

function isPort(string) {
  return isPositiveInteger(string) && string >= 0 && string <= 65535;
}

function normalizeConnectArgs(args) {
  
  if (args.length === 0) {
    throw new Error('no connect arguments');
  }
  
  let options = {};
  let connectListener;
  
  let next = 1;
  
  if (typeof args[0] === 'object') {
    
    options = args[0];
  }
  else if (isPort(args[0])) {
    
    options.port = parseInt(args[0], 10);
    
    if (args.length > 1 && typeof args[1] === 'string') {
      
      options.host = args[1];
      
      next = 2;
    }
    else {
      options.host = 'localhost';
    }
  }
  else if (typeof args[0] === 'string') {
    
    options.path = args[0];
  }
  else {
    
    throw new Error('invalid connect argument (expected port or path value)');
  }
  
  if (next < args.length) {
    
    if (typeof args[next] === 'function') {
      
      connectListener = args[next];
    }
    else {
      throw new Error('invalid connect argument ' +  
        '(expected connectListener argument to be a function)');
    }
    
    if (args.length > next + 1) {
      throw new Error('too many arguments'); 
    }
  }
  
  return [options, connectListener];
}

connect.normalizeConnectArgs = normalizeConnectArgs;

module.exports = connect;
