var Failover = require("./failover");
var BufferReadable = require("./buffer_readable");
var stream = require("stream");

function Message(headers, body, callback){
    this.headers = headers;
    this.body = body;
    this.callback = callback || function(){};
    this.receipt = false;
}

Message.prototype.getReadable = function(){
    var readable = (typeof this.body === "function" ? this.body() : this.body);
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
    
    var output = client.send(this.headers, {
        onReceipt: function(){   
            
            if(self.receipt){
                return;
            }
            
            self.receipt = true;
            
            if(callback){
                callback();
            }
            
            self.callback(null);
        }
    });
    
    var input = this.getReadable();
    
    input.pipe(output);
};

function SendPipeline(failover){
    this._failover = failover;
    this._messages = [];
    this._client = null;
    this._connecting = false;
    this._cancelled = false;
}

SendPipeline.prototype.send = function(headers, body, callback){
    
    var message = new Message(headers, body, callback);
    
    this._messages.push(message);
    
    if(this.client){
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
    
    var connection = this._failover.connect(function(error, client){
        
        self._connecting = false;
        
        if(self._cancelled){
            client.destroy();
            return;
        }
        
        if(error){
            self.cleanupMessages(error);
            return;
        }
        
        self._client = client;
        
        var disconnect = self._disconnect.bind(self);
        
        self._messages.forEach(function(message){
            
            if(message.receipt){
                return;
            }
            
            message.send(client, disconnect);
        });
        
        client.on("error", function(){
            self._client = null;
            self._connecting = true;
            connection.reconnect();
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
    
    this.cleanupMessages(new Error("operation aborted"));
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
    
    var connection = this._failover.connect(function(error, newClient){
        
        if(cancelled){
            newClient.destroy();
            return;
        }
        
        client = newClient;
        
        if(error){
            onMessageCallback(error);
            return;
        }
        
        client.on("error", function(){ 
            connection.reconnect();
        });
        
        client.subscribe(headers, function(message){
            onMessageCallback(null, message);
        });
    });
    
    return {
        cancel: cancel
    }
};

module.exports = Messaging;
