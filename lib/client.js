module.exports = Client;

var Socket = require("./socket");
var util = require("./util");

function Client(transportSocket, options){
    
    options = util.extend(options, {
        commandHandlers: {},
        unknownCommand: onUnknownCommand
    });
    
    Socket.call(this, transportSocket, options);
    
    this._receipts = {};
    this._nextReceiptId = 1;
    
    this._subscriptions = {};
    this._nextSubcriptionId = 1;
    
    this._nextTransactionId = 1;
}

util.inherits(Client, Socket);

Client.prototype._beforeSendResponse = function(requestFrame, responseFrame){
    // Do nothing
};

Client.prototype.sendFrame = function(command, headers, options){
    
    if(options){
        if(options.onReceipt){
            var id = this._nextReceiptId++;
            this._receipts[id] = options.onReceipt;
            headers["receipt"] = id;
        }
    }
    
    return Socket.prototype.sendFrame.apply(this, arguments);
};

Client.prototype.connect = function(options, callback){
    
    var headers = {};
    
    if(typeof options === "string"){
        headers["host"] = options;
    }
    else if(typeof options === "object"){
        headers = util.extend(headers, options);
    }
    
    headers = util.extend(headers, {
        "accepted-version": "1.0,1.1,1.2"
    });
    
    this.setCommandHandlers({
        "CONNECTED": onConnected,
        "ERROR": onError
    });
    
    if(typeof callback === "function"){
        this.once("connect", callback);
    }
    
    var frame = this.sendFrame("CONNECT", headers);
    
    frame.end();
};

Client.prototype.send = function(headers, options){
    return this.sendFrame("SEND", headers, options);
};

Client.prototype.begin = function(){
    
    var transaction = new Transaction(this._nextTransactionId++, this);
    
    this.sendFrame("BEGIN", {
        transaction: transaction.id
    }).end();
    
    return transaction;
};

Client.prototype.subscribe = function(headers, onMessageCallback){
    
    var id = headers["id"] !== undefined ? headers["id"] : this._nextSubcriptionId++;
    
    while(this._subscriptions[id] !== undefined){
        id = this._nextSubcriptionId++;
    }
    
    headers["id"] = id;
    
    var ack = headers["ack"];
    
    if(ack === undefined){
        ack = "auto";
    }
    
    var subscription = new Subscription(id, ack, onMessageCallback, this);
    
    this._subscriptions[id] = subscription;
    
    this.sendFrame("SUBSCRIBE", headers).end();
        
    return subscription;
};

Client.prototype.getSubscription = function(id){
    return this._subscriptions[id];
};

Client.prototype.disconnect = function(callback){
    
    var socket = this.getTransportSocket();
    
    this.sendFrame("DISCONNECT", {}, {
        onReceipt: callback
    }).end(function(){
        // Send FIN packet and prevent further writing on the socket
        socket.end();
    });
};

Client.prototype.readEmptyBody = function(frame, callback){
    
    var self = this;
    
    frame.readEmptyBody(function(isEmpty){
        
        if(isEmpty){
            if(typeof callback === "function"){
                callback.call(self);
            }
        }
        else{
            self.destroy(new Error("expected empty body frame"));
        }
    });
};

function onConnected(frame, beforeSendResponse){
    
    this.setVersion(frame.headers["version"] || "1.1");
    
    this.setCommandHandlers({
        "MESSAGE": onMessage,
        "RECEIPT": onReceipt,
        "ERROR": onError
    });
    
    var self = this;
    
    this.readEmptyBody(frame, function(){
        
        if(frame.headers["heart-beat"] !== undefined){
            
            var heartbeat = frame.headers["heart-beat"].split(",").map(function(x){return parseInt(x, 10);});
            
            if(heartbeat.length > 1 && !isNaN(heartbeat[0]) && !isNaN(heartbeat[1])){
                this.setHeartbeat(heartbeat[0], heartbeat[1]);
            }
        }
        
        self.emit("connect", {headers: frame.headers});
        
        beforeSendResponse();
    });
}

function onError(frame, beforeSendResponse){
    
    var message = "received ERROR frame";
    
    if(frame.headers["message"]){
        message += ": " + frame.headers["message"];
    }
    
    this.destroy(new Error(message));
}

function onMessage(frame, beforeSendResponse){
    
    var subId = frame.headers["subscription"];
    
    var subscription = this._subscriptions[subId];
    
    if(subscription === undefined){
        this.destroy(new Error("invalid subscription"));
    }
    
    subscription.processMessageFrame(frame);
    
    beforeSendResponse();
}

function onReceipt(frame, beforeSendResponse){
    
    var id = frame.headers["receipt-id"];
    
    if(id === undefined || this._receipts[id] === undefined){
        this.destroy(new Error("invalid receipt"));
        return;
    }
    
    this.readEmptyBody(frame, function(){
        this._receipts[id].call(this);
        delete this._receipts[id];
        beforeSendResponse();
    });
}

function onUnknownCommand(frame){
    this.destroy(new Error("unknown command '" + frame.command + "'"));
}

function Subscription(id, ack, onMessageCallback, client){
    
    this._id = id;
    this._ack = ack;
    this._onMessageCallback = onMessageCallback;
    this._client = client;
    this._unacknowledged = [];
    
    var self = this;
    
    function getAckHeaders(messageId){
        return {
            "subscription": id,
            "message-id": messageId
        };
    }
    
    switch(ack){
        
        case "auto":
            
            this._sendAck = function(){
                self._unacknowledged = [];
            };
            
            break;
            
        case "client":
            
            this._sendAck = function(type, messageId){
                
                var index = self._unacknowledged.indexOf(messageId);
                
                if(index !== -1){
                    
                    self._unacknowledged.splice(0, index + 1);
                    
                    client.sendFrame(type, getAckHeaders(messageId)).end();
                }
            };
            
            break;
            
        case "client-individual":
            
            this._sendAck = function(type, messageId){
                
                var index = self._unacknowledged.indexOf(messageId);
                
                if(index !== -1){
                    
                    self._unacknowledged.splice(index, 1);
                    
                    client.sendFrame(type, getAckHeaders(messageId)).end();
                }
            };
            
            break;
        
        default:
            throw new Error("unknown ack mode");
    }
}

Subscription.prototype.getId = function(){
    return this._id;
};

Subscription.prototype._createMessageObject = function(frame, ackFunction, nackFunction){
    
    function IncomingMessage(ackFunction, nackFunction){
        this.ack = ackFunction;
        this.nack = nackFunction;
    }
    
    IncomingMessage.prototype = frame;
    
    return new IncomingMessage(ackFunction, nackFunction);
};

Subscription.prototype.processMessageFrame = function(frame){
    
    var messageId = frame.headers["message-id"];
    
    this._unacknowledged.push(messageId);
    
    var self = this;
    
    var ack = function(){return self._sendAck("ACK", messageId);};
    var nack = function(){return self._sendAck("NACK", messageId);};
    
    this._onMessageCallback.call(this, this._createMessageObject(frame, ack, nack));
};

Subscription.prototype.unsubscribe = function(){
    
    var self = this;
    
    var headers = {
        "id": this._id
    };
    
    this._client.sendFrame("UNSUBSCRIBE", headers, {
        onReceipt: function(){
            delete self._client._subscriptions[self._id];
        }
    }).end();
};

function Transaction(id, client){
    this._client = client;
    this.id = id;
}

Transaction.prototype.send = function(){
    var frame = this._client.send.apply(this._client, arguments);
    frame.headers["transaction"] = this.id;
    return frame;
};

Transaction.prototype.abort = function(options){
    
    this._client.sendFrame("ABORT", {
        transaction: this.id
    }, options).end();
};

Transaction.prototype.commit = function(options){
    
    this._client.sendFrame("COMMIT", {
        transaction: this.id
    }, options).end();
};
