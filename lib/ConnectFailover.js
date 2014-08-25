/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.Failover
 * Copyright (c) 2013-2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var events  = require('events');
var util    = require('./util');
var connect = require('./connect');

var getAddressInfo   = require('./connect-failover/getAddressInfo');
var parseFailoverUri = require('./connect-failover/parseFailoverUri');
var parseServerUri   = require('./connect-failover/parseServerUri');

function ConnectFailover(servers, options) {
  
  var defaults = {
    
    // Milliseconds delay of the first reconnect
    initialReconnectDelay: 10,
    
    // Maximum milliseconds delay of any reconnect
    maxReconnectDelay: 30000,
    
    // Exponential increase of the reconnect delay
    useExponentialBackOff: true,
    
    // The exponent used in the exponential backoff attempts
    reconnectDelayExponent: 2.0,
    
    // Maximum number of consecutive failed connect attempts
    maxReconnectAttempts: 0,
    
    // Maximum number of reconnects
    maxReconnects: -1,
    
    // Randomly choose a server to use for reconnect
    randomize: true,
    
    // Override the connect function
    connectFunction: connect
  };
  
  options = util.extend({}, defaults, options);
  
  switch (typeof servers) {
    
    case 'undefined':
      servers = [{}]; // default server
      break;
      
    case 'string':
      var uriConfig = parseFailoverUri(servers);
      servers = uriConfig.servers;
      util.extend(options, uriConfig.options);
      break;
      
    default:
      break;
  }
  
  for (var key in defaults) {
    this[key] = options[key];
  }
  
  this._defaultConnectOptions = typeof options.connect === 'object' ? 
    options.connect : {};
  
  this._connect = options.connectFunction;
  
  this._servers = servers.map(this._createServer.bind(this));
}

util.inherits(ConnectFailover, events.EventEmitter);

ConnectFailover.prototype._createServer = function(config) {
  
  var connectOptions = this._normalizeConnectOptions(config);
  
  var server = {
    connectOptions: connectOptions,
    remoteAddress: getAddressInfo(connectOptions)
  };
  
  return server;
};

ConnectFailover.prototype._normalizeConnectOptions = function(arg) {
  
  var config = util.extend({
    host: 'localhost',
    port: 61613
  }, this._defaultConnectOptions);
  
  switch (typeof arg) {
    
    case 'string':
      
      // extend connectHeaders object
      var serverUriConfig = parseServerUri(arg);
      
      if (serverUriConfig.connectHeaders && config.connectHeaders) {
        util.extend( serverUriConfig.connectHeaders, 
          config.connectHeaders, 
          serverUriConfig.connectHeaders );
      }
      
      util.extend(config, serverUriConfig);
      
      break;
    
    case 'object':
      util.extend(config, arg);
      break;
    
    default:
      
      var type = typeof arg;
      
      throw new Error('invalid type (' + type + ') for server config argument');
  }
  
  return config;
};

ConnectFailover.prototype.addServer = function() {
  this._servers.push(this._createServer.apply(this, arguments));
};

ConnectFailover.prototype._getServerIndex = function(startIndex) {
  
  var servers = this._servers;
  
  if (servers.length === 0) {
    return -1;
  }
  
  if (this.randomize) {
    index = Math.round(Math.random() * (servers.length - 1));
  }
  else {
    index = (startIndex + 1) % servers.length;
  }
  
  return index;
};

ConnectFailover.prototype.getReconnectDelay = function(reconnects) {
  
  return Math.min(
    this.initialReconnectDelay * (
      this.useExponentialBackOff ? 
        Math.pow(this.reconnectDelayExponent, reconnects) - 1
      : Math.min(reconnects, 1)),
    this.maxReconnectDelay
  );
};

ConnectFailover.prototype.connect = function(callback) {
  
  var servers = this._servers;
  
  var reconnectAttempts = 0;
  var connects = 0;
  var index = 0;
  var lastError;
  
  var reconnect;
  
  var error = function(description) {
    
    var descErrorMsg = description ? ' (' + description + ')' : '';
    
    var lastErrorMsg = lastError && lastError.message ? 
      ' last error: ' + lastError.message : '';
    
    var connectError = new Error(
      'failed to establish session' + descErrorMsg + lastErrorMsg
    );
    
    if (lastError) {
      connectError.connectError = lastError;
    }
    
    callback(connectError);
  };
  
  if (servers.length === 0) {
    error('no server addresses configured');
    return;
  }
  
  var self = this;
  var doConnect = this._connect;
  
  var connect = function() {
    
    var server = servers[index];
    
    var onConnected = function(error, client) {
      
      if (error) {
        
        if (self.listeners('error').length > 0) {
          error.server = server;
          self.emit('error', error);
        }
        
        lastError = error;
        reconnect();
        return;
      }
      
      lastError = null; 
      reconnectAttempts = 0;
      connects += 1;
      
      self.emit('connect', server);
      
      callback(null, client, reconnect, server);
    };
    
    doConnect(server.connectOptions, onConnected);
    
    self.emit('connecting', server);
  };
  
  reconnect = function() {
    
    if (self.maxReconnects !== -1 && connects > self.maxReconnects) {
      error('too many reconnects');
      return;
    }
    
    reconnectAttempts += 1;
    
    var hitMaxReconnectAttempts = self.maxReconnectAttempts !== -1 && 
      reconnectAttempts >= self.maxReconnectAttempts;
    
    if (hitMaxReconnectAttempts) {
      error('tried ' + reconnectAttempts + ' connect attempts');
      return;
    }
    
    index = self._getServerIndex(index);
    
    setTimeout(connect, self.getReconnectDelay(reconnectAttempts));
  };
  
  connect();
};

ConnectFailover.prototype._parseFailoverUri = parseFailoverUri;
ConnectFailover.prototype._parseServerUri = parseServerUri;

module.exports = ConnectFailover;
