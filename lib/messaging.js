/*
 * stompit.Messaging
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var Failover        = require('./failover');
var BufferReadable  = require('./util/buffer/readable');
var stream          = require('stream');

function Message(headers, body, requestReceipt, callback){
    this.headers = headers;
    this.body = body;
    this.callback = callback || function(){};
    this.requestReceipt = requestReceipt;
    this.receipt = false;
}

Message.prototype.getReadable = function(){
    var readable = (typeof this.body === 'function' ? this.body() : this.body);
    if(!(readable instanceof stream.Readable)){
        var buffer = readable;
        if(!(buffer instanceof Buffer)){
            buffer = new Buffer(readable);
        }
        readable = new BufferReadable(buffer);
    }
    return readable;
};

Message.prototype.send = function(client, callback){
    
    var self = this;
    
    var options = {};
    
    if(this.requestReceipt){
        
        options['onReceipt'] = function(){   
            
            if(self.receipt){
                return;
            }
            
            self.receipt = true;
            
            if(typeof callback === 'function'){
                callback();
            }
            
            self.callback(null);
        };
    }
    
    var output = client.send(this.headers, options);
    
    var input = this.getReadable();
    input.pipe(output);
    
    if(!this.requestReceipt && typeof callback === 'function'){
        output.once('finish', callback);
    }
    
    return output;
};

function SendPipeline(failover){
    this._failover = failover;
    this._messages = [];
    this._client = null;
    this._connecting = false;
    this._cancelled = false;
}

SendPipeline.prototype.send = function(headers, body, callback){
    
    var message = new Message(headers, body, true, callback);
    
    this._messages.push(message);
    
    if(this._client){
        message.send(this._client, this._disconnect.bind(this));
    }
    else{
        this._connect();
    }
    
    return this;
};

SendPipeline.prototype._connect = function(){

    if(this._connecting){
        return;
    }
    
    this._connecting = true;
    
    var self = this;
    
    this._failover.connect(function(error, client, reconnect){
        
        self._connecting = false;
        
        if(self._cancelled){
            client.destroy();
            return;
        }
        
        if(error){
            self.cleanupMessages(error);
            return;
        }
        
        client.on('error', function(){
            self._client = null;
            self._connecting = true;
            reconnect();
        });
        
        self._client = client;
        
        var disconnect = self._disconnect.bind(self);
        
        self._messages.forEach(function(message){
            
            if(message.receipt){
                return;
            }
            
            message.send(client, disconnect);
        });
    });
};

SendPipeline.prototype._disconnect = function(){
    
    if(!this._client){
        return;
    }
    
    var numMessages = this._messages.length;
    for(var i = 0; i < numMessages; i++){
        if(!this._messages[i].receipt){
            return;
        }
    }
    
    this._messages = [];
    
    this._client.destroy();
    this._client = null;
};

SendPipeline.prototype.cleanupMessages = function(error){
    
    this._messages.forEach(function(message){
        message.callback(error);
    });
    
    this._messages = [];
};

SendPipeline.prototype.cancel = function(){
    
    this._cancelled = true;
    
    if(this._client){
        this._client.destroy();
        this._client = null;
    }
    
    this.cleanupMessages(new Error('operation aborted'));
};

function Messaging(){
    
    if(arguments.length > 0  && arguments[0] instanceof Failover){
        this._failover = arguments[0];
    }
    else{
        this._failover = Object.create(Failover.prototype);
        Failover.apply(this._failover, arguments);
    }
}

Messaging.prototype.pipeline = function(){
    return new SendPipeline(this._failover);  
};

Messaging.prototype.send = function(headers, body, callback){
    var pipeline = new SendPipeline(this._failover);
    pipeline.send(headers, body, callback);
    return pipeline;
};

function Transaction(failover){
    this._failover = failover;
    this._messages = [];
    this._connecting = false;
    this._client = null;
    this._transaction = null;
    this._finalCommand = null;
};

Transaction.prototype.send = function(headers, body){
    
    var message = new Message(headers, body, false);
    
    this._messages.push(message);
    
    if(this._transaction){
        message.send(this._transaction);
    }
    else{
        this._connect();
    }
    
    return this;
};

Transaction.prototype._reset = function(){
    
    if(this._client){
        this._client.destroy();
        this._client = null;
        this._transaction = null;
    }
    
    this._messages = [];
    this._finalCommand = null;
};

Transaction.prototype._setFinalCommand = function(commandName, callback){
    
    var self = this;
    
    var sendCommand = function(){
        
        self._transaction[commandName]({
            onReceipt: function(){
                self._reset();
                if(typeof callback === 'function'){
                    callback();
                }
            }
        });
    };
    
    this._finalCommand = sendCommand;
    
    if(this._transaction){
        sendCommand();
    }
};

Transaction.prototype.commit = function(callback){
    this._setFinalCommand('commit', callback);
    return this;
};

Transaction.prototype.abort = function(callback){
    this._setFinalCommand('abort', callback);
    return this;
};

Transaction.prototype.cancel = Transaction.prototype.abort;

Transaction.prototype._connect = function(){
    
    if(this._connecting){
        return;
    }
    
    this._connecting = true;
    
    var self = this;
    
    this._failover.connect(function(error, client, reconnect){
        
        self._connecting = false;
        
        if(self._cancelled){
            client.destroy();
            return;
        }
        
        if(error){
            self.cleanupMessages(error);
            return;
        }
        
        client.on('error', function(){
            self._client = null;
            self._transaction = null;
            self._connecting = true;
            reconnect();
        });
        
        self._client = client;
        self._transaction = client.begin();
        
        self._messages.forEach(function(message){
            message.send(self._transaction);
        });
        
        if(self._finalCommand){
            self._finalCommand();
        }
    });
};

Messaging.prototype.begin = function(){
    var transaction = new Transaction(this._failover);
    return transaction;
}

Messaging.prototype.subscribe = function(headers, onMessageCallback){
    
    var cancelled = false;
    var client;
    
    var cancel = function(){
        
        if(cancelled){
            return;
        }
        
        if(client){
            client.destroy();
        }
        
        cancelled = true;
    };
    
    this._failover.connect(function(error, newClient, reconnect){
        
        if(cancelled){
            newClient.destroy();
            return;
        }
        
        client = newClient;
        
        if(error){
            onMessageCallback(error);
            return;
        }
        
        client.on('error', function(){ 
            reconnect();
        });
        
        client.subscribe(headers, function(error, message){
            
            if(error){
                return;
            }
            
            onMessageCallback(null, message);
        });
    });
    
    return {
        cancel: cancel
    }
};

module.exports = Messaging;
