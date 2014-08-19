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
    initialReconnectDelay: 10,
    maxReconnectDelay: 30000,
    useExponentialBackOff: true,
    reconnectDelayExponent: 2.0,
    maxReconnectAttempts: 0,
    maxReconnects: -1,
    randomize: true
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
  
  var createConnector = this._createConnector.bind(this);
  
  this._connectors = servers.map(function(server) {
    return createConnector(server);
  });
}

util.inherits(ConnectFailover, events.EventEmitter);

ConnectFailover.prototype._createConnector = function(arg) {
  
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
  
  var connector = function(callback) {
    return connect(config, callback);
  };
  
  connector.remoteAddress = getAddressInfo(config);
  
  return connector;
};

ConnectFailover.prototype.addServer = function() {
  this._connectors.push(this._createConnector.apply(this, arguments));
};

ConnectFailover.prototype._getConnectorIndex = function(startIndex) {
  
  var connectors = this._connectors;
  
  if (connectors.length === 0) {
    return -1;
  }
  
  if (this.randomize) {
    index = Math.round(Math.random() * (connectors.length - 1));
  }
  else {
    index = (startIndex + 1) % connectors.length;
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
  
  var connectors = this._connectors;
  
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
  
  if (connectors.length === 0) {
    error('no server addresses configured');
    return;
  }
  
  var self = this;
  
  var connect = function() {
    
    var connector = connectors[index];
        
    var client = connector(function(error) {
      
      if (error) {
        
        if (self.listeners('error').length > 0) {
          error.connector = connector;
          self.emit('error', error);
        }
        
        lastError = error;
        reconnect();
        return;
      }
      
      lastError = null; 
      reconnectAttempts = 0;
      connects += 1;
      
      self.emit('connect', connector);
      
      callback(null, client, reconnect, connector);
    });
    
    self.emit('connecting', connector);
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
    
    index = self._getConnectorIndex(index);
    
    setTimeout(connect, self.getReconnectDelay(reconnectAttempts));
  };
  
  connect();
};

ConnectFailover.prototype._parseFailoverUri = parseFailoverUri;
ConnectFailover.prototype._parseServerUri = parseServerUri;

module.exports = ConnectFailover;
