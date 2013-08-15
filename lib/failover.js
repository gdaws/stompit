/*
 * stompit.Failover
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var events  = require('events');
var util    = require('./util');
var connect = require('./connect');

function Failover(servers, options){
    
    servers = servers || [{}];
    
    var defaults = {
        initialReconnectDelay: 10,
        maxReconnectDelay: 30000,
        useExponentialBackOff: true,
        reconnectDelayExponent: 2.0,
        maxReconnectAttempts: -1,
        maxReconnects: -1,
        randomize: true
    };
    
    options = util.extend(defaults, options);
    
    for(var key in defaults){
        this[key] = options[key];
    }
    
    var createConnector = this._createConnector.bind(this);
    
    this._connectors = servers.map(function(server){
        return createConnector(server);
    });
}

util.inherits(Failover, events.EventEmitter);

Failover.prototype._createConnector = function(options){
    
    var connector;
    
    if(typeof options === 'function'){
        connector = options;
    }
    else{
        connector = function(callback){
            return connect(options, callback);
        };
    }
    
    return connector;
};

Failover.prototype.addServer = function(){
    this._connectors.push(this._createConnector.apply(this, arguments));
};

Failover.prototype._getConnectorIndex = function(startIndex){
    
    var connectors = this._connectors;
    
    if(connectors.length === 0){
        return -1;
    }
    
    if(this.randomize){
        index = Math.round(Math.random() * (connectors.length - 1));
    }
    else{
        index = (startIndex + 1) % connectors.length;
    }
    
    return index;
};

Failover.prototype.getReconnectDelay = function(reconnects){
    
    return Math.min(
        this.initialReconnectDelay * (
            this.useExponentialBackOff ? 
                Math.pow(this.reconnectDelayExponent, reconnects) - 1
            : Math.min(reconnects, 1)),
        this.maxReconnectDelay
    );
};

Failover.prototype.connect = function(callback){
    
    var connectors = this._connectors;
    
    var error = function(description){
        callback(new Error('could not connect' + (description ? ' (' + description + ')' : '')));  
    };
    
    if(connectors.length === 0){
        error('no server addresses configured');
        return;
    }
    
    var reconnectAttempts = 0;
    var connects = 0;
    var index = 0;
    
    var connect = function(){
        
        var connector = connectors[index];
        
        var client = connector(function(error){
            
            if(error){
                reconnect();
                return;
            }
            
            reconnectAttempts = 0;
            connects += 1;
            
            var args = Array.prototype.slice.call(arguments, 0);
            args.splice(0, 0, null, client);
            
            callback.apply(null, args);
        });
    };
    
    var self = this;
    
    var reconnect = function(){
        
        if(self.maxReconnects !== -1 && connects > self.maxReconnects){
            error('too many reconnects');
            return;
        }
        
        reconnectAttempts += 1;
        
        if(self.maxReconnectAttempts !== -1 && reconnectAttempts >= self.maxReconnectAttempts){
            error('tried ' + reconnectAttempts + ' connect attempts');
            return;
        }
        
        index = self._getConnectorIndex(index);
        
        setTimeout(connect, self.getReconnectDelay(reconnectAttempts));
    };
    
    connect();
    
    return {
        reconnect: reconnect
    };
};

module.exports = Failover;
