var Failover = require("./failover");
var BufferReadable = require("./buffer_readable");
var stream = require("stream");

function Messaging(){
    
    if(arguments.length > 0  && arguments[0] instanceof Failover){
        this._failover = arguments[0];
    }
    else{
        this._failover = Object.create(Failover.prototype);
        Failover.apply(this._failover, arguments);
    }
}

Messaging.prototype.send = function(headers, message, callback){
    
    if(!callback){
        callback = function(){};
    }
    
    var resetInput = function(){
        var readable = (typeof message === "function" ? message() : message);
        if(!(readable instanceof stream.Readable)){
            var buffer = readable;
            if(!(buffer instanceof Buffer)){
                buffer = new Buffer(readable);
            }
            readable = new BufferReadable(buffer);
        }
        return readable;
    };
    
    var sending = true;
    var client;
    
    var cancel = function(errorMessage){
        
        if(!sending){
            return false;
        }
        
        if(client){
            client.destroy();
        }
        
        sending = false;
        
        return true;
    };
    
    var connection = this._failover.connect(function(error, newClient){
        
        if(!sending){
            newClient.destroy();
            return;
        }
        
        client = newClient;
        
        if(error){
            sending = false;
            callback(error);
            return;
        }
        
        client.on("error", function(){ 
            connection.reconnect();
        });
        
        var output = client.send(headers);
        
        var input = resetInput();
        
        input.pipe(output);
        
        client.disconnect(function(){
            sending = false;
            callback(null);
        });
    });
    
    return {
        cancel: cancel
    };
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
