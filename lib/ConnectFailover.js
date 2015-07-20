/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.Failover
 * Copyright (c) 2013-2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var events  = require('events');
var util    = require('util');
var assign  = require('object-assign');
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
    
    // Maximum number of reconnects
    maxReconnects: -1,
    
    // Randomly choose a server to use for reconnect
    randomize: true,
    
    // Override the connect function
    connectFunction: connect
  };
  
  options = assign({}, defaults, options);
  
  switch (typeof servers) {
    
    case 'undefined':
      servers = [{}]; // default server
      break;
      
    case 'string':
      var uriConfig = parseFailoverUri(servers);
      servers = uriConfig.servers;
      assign(options, uriConfig.options);
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
  
  var config = assign({
    host: 'localhost',
    port: 61613
  }, this._defaultConnectOptions);
  
  switch (typeof arg) {
    
    case 'string':
      
      // extend connectHeaders object
      var serverUriConfig = parseServerUri(arg);
      
      if (serverUriConfig.connectHeaders && config.connectHeaders) {
        assign( serverUriConfig.connectHeaders, 
          config.connectHeaders, 
          serverUriConfig.connectHeaders );
      }
      
      assign(config, serverUriConfig);
      
      break;
    
    case 'object':
      assign(config, arg);
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

ConnectFailover.prototype.getReconnectDelay = function(reconnects) {
  
  return Math.min(
    this.initialReconnectDelay * (
      this.useExponentialBackOff ? 
        Math.pow(this.reconnectDelayExponent, reconnects) - 1
      : Math.min(reconnects, 1)),
    this.maxReconnectDelay
  );
};

ConnectFailover.prototype._initConnectState = function() {
  
  function ConnectState(serverProperties) {
    
    this.serverProperties = serverProperties;
    
    this.failedConnects = 0;
    
    this._blacklisted = false;
    this._blacklistError = null;
  }
  
  // Public API method
  ConnectState.prototype.blacklist = function(error) {
    
    if (this._blacklisted) {
      return;
    }
    
    this._blacklisted = true;
    this._blacklistError = error;  
  };
  
  ConnectState.prototype.isBlacklisted = function() {
    return this._blacklisted;
  };
  
  ConnectState.prototype.getBlacklistError = function() {
    return this._blacklistError;
  };
  
  var servers = this._servers.map(function(server) {
    return new ConnectState(server);
  });
  
  // Shuffle the alternative servers
  if (this.randomize === true && servers.length > 2) {
    
    for(var i = 1; i < servers.length; i++) {
      
      var server = servers[i];
      var random = 1 + Math.round(Math.random() * (servers.length - 2));
      
      servers[i] = servers[random];
      servers[random] = server;
    }
  }
  
  return servers;
};

ConnectFailover.prototype.connect = function(callback) {
  
  var servers = this._initConnectState();
  var blacklist = [];
  
  if (servers.length === 0) {
    callback(new Error('no server addresses'));
    return;
  }
  
  var self = this;
  var doConnect = this._connect;
  var connectingClient;
  var maxReconnects = this.maxReconnects;

  var aborted = false;
  var reconnectDelayTimeout;
  
  function abort() {

    aborted = true;

    clearTimeout(reconnectDelayTimeout);

    if (connectingClient) {
      connectingClient.getTransportSocket().destroy();
    }
  }

  function connect() {
    
    if (aborted) {
      return;
    }

    var server = servers[0];
    
    var onConnected = function(error, client) {
      
      connectingClient = null;
      
      if (aborted) {
        if (!error) {
          client.destroy();
        }
        return;
      }
      
      if (error) {
        
        if (self.listeners('error').length > 0) {
          error.connectArgs = server.serverProperties.connectOptions;
          self.emit('error', error, server);
        }
        
        // Server is sending an ERROR frame due to bad connect headers.
        if (typeof error.isApplicationError === 'function' &&
            error.isApplicationError()) {
          
          server.blacklist(error);
        }
        
        server.failedConnects += 1;
        
        reconnect();
        
        return;
      }
      
      server.failedConnects = 0;
      
      self.emit('connect', server);
      
      callback(null, client, reconnect, server);
    };
    
    connectingClient = 
      doConnect(server.serverProperties.connectOptions, onConnected);
    
    self.emit('connecting', server);
  }
  
  function reconnect() {
    
    if (aborted) {
      return;
    }

    var server = servers[0];
    
    if (maxReconnects !== -1 && server.failedConnects >= maxReconnects) {
      server.blacklist(new Error(util.format(
        'too many failed connects (%d)', server.failedConnects
      )));
    }
    
    servers.shift();
    
    if (!server.isBlacklisted()) {
      servers.push(server);
    }
    else{
      blacklist.push(server);
    }
    
    if (servers.length === 0) {
      
      var error = blacklist.length == 1 ? blacklist[0].getBlacklistError() :
        new Error('exhausted connection failover');
      
      callback(error);
      return;
    }
    
    reconnectDelayTimeout = setTimeout(
      connect, self.getReconnectDelay(servers[0].failedConnects));
  }
  
  connect();

  return {
    abort: abort
  };
};

ConnectFailover.prototype._parseFailoverUri = parseFailoverUri;
ConnectFailover.prototype._parseServerUri = parseServerUri;

module.exports = ConnectFailover;
