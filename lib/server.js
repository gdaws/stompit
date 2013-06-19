module.exports = Server;

var Socket = require("./socket");
var util = require("./util");

function Server(transportSocket, options){
    
    var processConnect = forwardEmptyFrame(onConnect);
    
    options = util.extend(options, {
        commandHandlers:{
            "STOMP": processConnect,
            "CONNECT": processConnect
        },
        unknownCommand: onUnknownCommand
    });
    
    Socket.call(this, transportSocket, options);
}

util.inherits(Server, Socket);

Server.prototype.readEmptyBody = function(frame, callback){
    
    var self = this;
    
    frame.readEmptyBody(function(isEmpty){
        
        if(isEmpty){
            if(typeof callback === "function"){
                callback.call(self);
            }
        }
        else{
            self.destroy();
        }
    });
};

Server.prototype.sendError = function(message){
    
    var headers = {};
    
    if(typeof message === "string"){
        headers.message = message;
    }
    
    var frame = this.sendFrame("ERROR", headers);
    
    var self = this;
    
    frame.once("finish", function(){
        self.getTransportSocket().end();
    });
    
    return frame;
};

Server.prototype._beforeSendResponse = function(requestFrame, responseFrame, responseEndCallback){
     
    var receiptId = requestFrame.headers["receipt"];
    
    if(receiptId !== undefined){
        if(responseFrame){
            responseFrame.headers["receipt-id"] = receiptId;
        }
        else{
            
            responseFrame = this.sendFrame("RECEIPT", {
                "receipt-id": receiptId
            });
            
            responseFrame.end(responseEndCallback);
        }
    }
    else{
        process.nextTick(responseEndCallback);
    }
    
    return responseFrame;
};

function forwardEmptyFrame(callback){
    return function(frame, beforeSendResponseCallback){
        this.readEmptyBody(frame, function(){
            callback.apply(this, [frame, beforeSendResponseCallback]);
        });
    };
}

function onConnect(frame, beforeSendResponse){
    
    var commands = {
        "DISCONNECT": forwardEmptyFrame(onDisconnect)
    };
    
    if(this._send){
        commands["SEND"] = this._send.bind(this);
    }
    
    if(this._subscribe){
        
        commands["SUBSCRIBE"] = forwardEmptyFrame(this._subscribe.bind(this));
        commands["UNSUBSCRIBE"] = forwardEmptyFrame(this._unsubscribe.bind(this));
        
        if(this._ack){
            commands["ACK"] = forwardEmptyFrame(this._ack.bind(this));
            commands["NACK"] = forwardEmptyFrame(this._nack.bind(this));
        }
    }
    
    if(this._begin){
        commands["BEGIN"] = forwardEmptyFrame(this._begin.bind(this));
        commands["COMMIT"] = forwardEmptyFrame(this._commit.bind(this));
        commands["ABORT"] = forwardEmptyFrame(this._abort.bind(this));
    }
    
    this.setCommandHandlers(commands);
    
    var headers = {
        "heart-beat": this.getHeartbeat().join(",")
    };
    
    beforeSendResponse(this.sendFrame("CONNECTED", headers)).end();
    
    if(frame.headers["heart-beat"] !== undefined){
        
        var heartbeat = frame.headers["heart-beat"].split(",").map(function(x){return parseInt(x, 10);});
        
        if(heartbeat.length > 1 && !isNaN(heartbeat[0]) && !isNaN(heartbeat[1])){
            this.setHeartbeat(heartbeat[0], heartbeat[1]);
        }
    }
    
    this.emit("connection");
}

function onDisconnect(frame, beforeSendResponse){
    
    this.setCommandHandlers({});
    
    var self = this;
    
    this._disconnect.apply(this, [frame, function(frame, responseEndCallback){
        beforeSendResponse(frame, function(){
            if(typeof responseEndCallback === "function"){
                responseEndCallback();
            }
            self._end();
        });
    }]);
}

function onUnknownCommand(frame, beforeSendResponse){
    beforeSendResponse(this.sendError("unknown command '" + frame.command + "'")).end();
}
