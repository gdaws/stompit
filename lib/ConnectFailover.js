/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { EventEmitter } = require('events');
const { format } = require('util');
const connect = require('./connect');

const getAddressInfo = require('./connect-failover/getAddressInfo');
const parseFailoverUri = require('./connect-failover/parseFailoverUri');
const parseServerUri = require('./connect-failover/parseServerUri');

class ConnectFailover extends EventEmitter {

  constructor(servers, options) {
    
    super();

    const defaults = {
      
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
    
    options = {...defaults, ...options};
    
    switch (typeof servers) {
      
      case 'undefined':
        servers = [{}]; // default server
        break;
        
      case 'string':
        const uriConfig = parseFailoverUri(servers);
        servers = uriConfig.servers;
        Object.assign(options, uriConfig.options);
        break;
        
      default:
        break;
    }
    
    for (let key in defaults) {
      this[key] = options[key];
    }
    
    this._defaultConnectOptions = typeof options.connect === 'object' ? 
      options.connect : {};
    
    this._connect = options.connectFunction;
    
    this._servers = servers.map(this._createServer.bind(this));
  }

  _createServer(config) {
    
    const connectOptions = this._normalizeConnectOptions(config);
    
    const server = {
      connectOptions: connectOptions,
      remoteAddress: getAddressInfo(connectOptions)
    };
    
    return server;
  }

  _normalizeConnectOptions(arg) {
    
    const config = Object.assign({
      host: 'localhost',
      port: 61613
    }, this._defaultConnectOptions);
    
    switch (typeof arg) {
      
      case 'string':
        
        // extend connectHeaders object
        const serverUriConfig = parseServerUri(arg);
        
        if (serverUriConfig.connectHeaders && config.connectHeaders) {
          Object.assign( serverUriConfig.connectHeaders, 
            config.connectHeaders, 
            serverUriConfig.connectHeaders );
        }
        
        Object.assign(config, serverUriConfig);
        
        break;
      
      case 'object':
        Object.assign(config, arg);
        break;
      
      default:
        
        const type = typeof arg;
        
        throw new Error(`invalid type (${type}) for server config argument`);
    }
    
    return config;
  }

  addServer() {
    this._servers.push(this._createServer.apply(this, arguments));
  }

  getReconnectDelay(reconnects) {
    
    return Math.min(
      this.initialReconnectDelay * (
        this.useExponentialBackOff ? 
          Math.pow(this.reconnectDelayExponent, reconnects) - 1
        : Math.min(reconnects, 1)),
      this.maxReconnectDelay
    );
  }

  _initConnectState() {
    
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
    
    const servers = this._servers.map(function(server) {
      return new ConnectState(server);
    });
    
    // Shuffle the alternative servers
    if (this.randomize === true && servers.length > 2) {
      
      for (let i = 1; i < servers.length; i++) {
        
        const server = servers[i];
        const random = 1 + Math.round(Math.random() * (servers.length - 2));
        
        servers[i] = servers[random];
        servers[random] = server;
      }
    }
    
    return servers;
  }

  connect(callback) {
    
    const servers = this._initConnectState();
    const blacklist = [];
    
    if (servers.length === 0) {
      callback(new Error('no server addresses'));
      return;
    }
    
    const self = this;
    const doConnect = this._connect;
    let connectingClient;
    const maxReconnects = this.maxReconnects;

    let aborted = false;
    let reconnectDelayTimeout;
    
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

      const server = servers[0];
      
      const onConnected = function(error, client) {
        
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

      const server = servers[0];
      
      if (maxReconnects !== -1 && server.failedConnects >= maxReconnects) {
        server.blacklist(new Error(format(
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
        
        const error = blacklist.length == 1 ? blacklist[0].getBlacklistError() :
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
  }
}

module.exports = ConnectFailover;
