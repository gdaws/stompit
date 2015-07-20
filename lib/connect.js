/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.connect
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var net     = require('net');
var tls     = require('tls');
var assign  = require('object-assign');
var Client  = require('./Client');

// Connect to a server and establish a STOMP session.
function connect() {
  
  var args = normalizeConnectArgs(arguments);
  
  var options = assign({
    
    host: 'localhost',
    port: 61613,
    timeout: 3000,
    connectHeaders: {}
    
  }, args[0]);
  
  var connectListener = args[1];
  
  var client, socket, timeout, originalSocketDestroy;
  
  var cleanup = function() {
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    client.removeListener('error', onError);
    client.removeListener('connect', onConnected);
  };
  
  var onError = function(error) {
    
    cleanup();
    
    error.connectArgs = options;
    
    if (typeof connectListener === 'function') {
      connectListener(error);
    }
  };
  
  var onConnected = function() {
    
    if (originalSocketDestroy) {
      socket.destroy = originalSocketDestroy;
    }
    
    cleanup();
    
    client.emit('socket-connect');
    
    var connectOpts = assign({host: options.host}, options.connectHeaders);
    
    client.connect(connectOpts, connectListener);
  };
  
  var transportConnect = net.connect;
  
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
  
  var type = typeof value;
  
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
  
  var options = {};
  var connectListener;
  
  var next = 1;
  
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
