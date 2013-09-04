/*
 * stompit.Failover
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var events  = require('events');
var util    = require('./util');
var connect = require('./connect');
var qs      = require('qs');

function Failover(servers, options){
    
    var defaults = {
        initialReconnectDelay: 10,
        maxReconnectDelay: 30000,
        useExponentialBackOff: true,
        reconnectDelayExponent: 2.0,
        maxReconnectAttempts: -1,
        maxReconnects: -1,
        randomize: true
    };
    
    switch(typeof servers){
        case 'undefined':
            servers = [{}]; // default server
            break;
        case 'string':
            var uriConfig = this._parseFailoverUri(servers);
            servers = uriConfig.servers;
            options = util.extend(options, uriConfig.options);
            break;
        default:
            break;
    }
    
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

Failover.prototype._createConnector = function(arg){
    
    var config;
    
    switch(typeof arg){
        case 'function':
            return arg;
        
        case 'string':
            config = this._parseServerUri(arg);
            break;
        
        case 'object':
            config = arg;
            break;
        
        default:
            throw new Error('invalid type for server config argument');
    }
    
    return function(callback){
        return connect(config, callback);  
    };
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
    
    var reconnect;
        
    var connect = function(){
        
        var connector = connectors[index];
        
        var client = connector(function(error){
            
            if(error){
                reconnect();
                return;
            }
            
            reconnectAttempts = 0;
            connects += 1;
            
            callback(null, client, reconnect);
        });
    };
    
    var self = this;
    
    reconnect = function(){
        
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
};

Failover.prototype._parseFailoverUri = function(uri){
    
    var serverList = uri;
    var optionsQueryString = null;
    
    var comps = uri.match(/^failover:\(([^\)]*)\)(\?.*)?$/);
    
    if(comps){
        serverList = comps[1];
        optionsQueryString = comps[2] ? comps[2].substring(1) : void 0;
    }
    
    var servers = serverList.length > 0 ? serverList.split(',') : [];
    
    var parseString = function(value){
        value = '' + value;
        var valueLC = value.toLowerCase();
        if(valueLC === 'false'){
            value = false;
        }
        else if(valueLC === 'true'){
            value = true;
        }
        else{
            var num = parseFloat(value, 10);
            if(!isNaN(num)){
                value = num; 
            }
        }
        return value;
    };
    
    var parseAggregate = function(object){
        var out = {};
        for(var key in object){
            var value = object[key];
            var type = typeof value;
            if(type === 'object' || type === 'array'){
                value = parseAggregate(value);
            }
            else{
                value = parseString(value);
            }
            out[key] = value;
        }
        return out;
    };
    
    var options = optionsQueryString ? parseAggregate(qs.parse(optionsQueryString)) : {};
    
    var validateBool = function(name, value){
        
        if(value === void 0){
            return;
        }
        
        var type = typeof value;
        
        if(type === 'number'){
            value = Boolean(value);
        }
        
        if(typeof value !== 'boolean'){
            throw new Error('invalid ' + name + ' value \'' + options[name] + '\' (expected boolean)');
        }
        
        return value;
    };
    
    var validateFloat = function(name, value, lowest, greatest){
        
        if(value === void 0){
            return;
        }
        
        if(typeof value !== 'number' || value < lowest || value > greatest){
            throw new Error('invalid ' + name + ' value \'' + options[name] + '\' (expected number between ' + lowest + ' and ' + greatest + ')');
        }
        
        return value;
    };
    
    options.initialReconnectDelay   = validateFloat('initialReconnectDelay',    options.initialReconnectDelay,   0, Infinity);
    options.maxReconnectDelay       = validateFloat('maxReconnectDelay',        options.maxReconnectDelay,       0, Infinity);
    options.useExponentialBackOff   = validateBool ('useExponentialBackOff',    options.useExponentialBackOff);
    options.reconnectDelayExponent  = validateFloat('reconnectDelayExponent',   options.reconnectDelayExponent,  0, Infinity);
    options.maxReconnectAttempts    = validateFloat('maxReconnectAttempts',     options.maxReconnectAttempts,   -1, Infinity);
    options.maxReconnects           = validateFloat('maxReconnects',            options.maxReconnects,          -1, Infinity);
    options.randomize               = validateBool ('randomize',                options.randomize);
    
    return {
        servers: servers,
        options: options
    };
};

Failover.prototype._parseServerUri = function(uri){
    
    var comps = uri.match(/^\s*((\w+):\/\/)?(([^:]+):([^@]+)@)?([\w-.]+)(:(\d+))?\s*$/);
    
    if(!comps){
        throw new Error('could not parse server uri \'' + uri + '\'');
    }
    
    var scheme   = comps[2];
    var login    = comps[4];
    var passcode = comps[5];
    var hostname = comps[6];
    var port     = comps[8];
    
    var server = {
        host: hostname,
        connectHeaders: {}
    };
    
    if(scheme === 'ssl' || scheme === 'stomp+ssl'){
        server.ssl = true;
    }
    
    if(port !== void 0){
        server.port = parseInt(port, 10);
    }
    
    if(login !== void 0){
        server.connectHeaders.login = login;
    }
    
    if(passcode !== void 0){
        server.connectHeaders.passcode = passcode;
    }
    
    return server;
};

module.exports = Failover;
