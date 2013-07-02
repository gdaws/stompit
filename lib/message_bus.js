
var util = require("util");
var StompServerConnection = require("./server");

function MessageBus(){
    
    this._consumer = {};
    
    this.softwareId = "Stompit.MessageBus/" + util.readPackageJson().version;
}

MessageBus.prototype.addClient = function(socket){
    
    var connection = new MessageBusConnection(socket, this, {softwareId: this.softwareId});
    
    return connection;
};

MessageBus.prototype.getConsumerPool = function(destination){
    
    var pool = this._consumer[destination];
    
    if(!pool){
        pool = new ConsumerPool();
        this._consumer[destination] = pool;
    }
    
    return pool;
};

MessageBus.prototype.consumeMessage = function(frame, callback){
    this.getConsumerPool(frame.headers.destination).consume(frame, callback);
};

function MessageBusConnection(transportSocket, server, options){
    
    this.server = server;
    
    this._pendingSends = 0;
    this._pendingReceives = 0;
    this._nextMessageId = 1;
    this._ackHandlers = {};
    this._subscriptions = {};
    this._transactionConsumer = {};
    
    StompServerConnection.apply(this, [transportSocket, options]);
}

util.inherits(MessageBusConnection, StompServerConnection);

MessageBusConnection.prototype._send = function(frame, beforeSendResponse){
    
    if(frame.headers.destination === undefined){
        beforeSendResponse(this.sendError("destination unspecified")).end();
        return;
    }
    
    var self = this;
    
    this._pendingSends += 1;
    
    this.server.consumeMessage(frame, function(error){
        
        self._pendingSends -= 1;
        
        if(error){
            beforeSendResponse(self.sendError(error.message)).end();
        }
        else{
            beforeSendResponse();
        }
        
        self.emit("consumed-message", error, frame);
    });
};

MessageBusConnection.prototype._subscribe = function(frame, beforeSendResponse){
    
    var destination = frame.headers.destination;
    var id = frame.headers.id;
    
    if(this._subscriptions.hasOwnProperty(id)){
        beforeSendResponse(this.sendError("subscription id already in use")).end();
        return;
    }
    
    var subscription = new Subscription(this, frame.headers);
    
    this._subscriptions[id] = subscription;
    
    this.server.getConsumerPool(destination).addConsumer(subscription);
};

MessageBusConnection.prototype._unsubscribe = function(frame, beforeSendResponse){
    
    var id = frame.headers.id;
    
    if(!this._subscriptions.hasOwnProperty(id)){
        beforeSendResponse(this.sendError("invalid subscription id")).end();
        return;
    }
    
    unsubscribe.call(this, id);
    
    beforeSendResponse();
};

function unsubscribe(id){
    var subscription = this._subscriptions[id];
    this.server.getConsumerPool(subscription.headers.destination).removeConsumer(subscription);
    delete this._subscriptions[id];
}

function onAck(type, frame, beforeSendResponse){
    var messageId = frame.headers["message-id"];
    var handler = this._ackHandlers[messageId];
    if(handler){
        handler[type]();
        delete this._ackHandlers[messageId];
        beforeSendResponse();
    }
}

MessageBusConnection.prototype._ack = function(frame, beforeSendResponse){
    return onAck.apply(this, ["ack", frame, beforeSendResponse]);
};

MessageBusConnection.prototype._nack = function(frame, beforeSendResponse){
    return onAck.apply(this, ["nack", frame, beforeSendResponse]);
};

MessageBusConnection.prototype._begin = function(frame, beforeSendResponse){
    beforeSendResponse(this.sendError("transactions are unsupported")).end();
};

MessageBusConnection.prototype._commit = function(frame, beforeSendResponse){
    beforeSendResponse(this.sendError("transactions are unsupported")).end();
};

MessageBusConnection.prototype._abort = function(frame, beforeSendResponse){
    beforeSendResponse(this.sendError("transactions are unsupported")).end();
};

MessageBusConnection.prototype._disconnect = function(frame, beforeSendResponse){
    
    // client cannot send ACK frames after sending DISCONNECT frame
    if(this._pendingReceives > 0){
        beforeSendResponse(this.sendError("disconnect request has interrupted " + this._pendingReceives + " pending messages")).end();
        return;
    }
    
    for(var id in this._subscriptions){
        unsubscribe.call(this, id);
    }
    
    if(this._pendingSends > 0){
        
        var self = this;
        var hasError = false;
        
        this.on("consumed-message", function(error){
            
            hasError |= error !== null && error !== undefined;
            
            if(self._pendingSends < 1){
                if(hasError){
                    beforeSendResponse(self.sendError("failed to consume all messages")).end();
                }
                else{
                    beforeSendResponse();
                }
            }
        });
    }
    else{
        beforeSendResponse();
    }
};

MessageBusConnection.prototype.reserveMessageId = function(){
    return this._nextMessageId++;
};

MessageBusConnection.prototype.bindAckHandlers = function(messageId, ackCallback, nackCallback){
    
    this._ackHandlers[messageId] = {
        ack: ackCallback,
        nack: nackCallback
    };
};

function Subscription(connection, headers){
    this.connection = connection;
    this.headers = headers;
    this.id = headers.id;
    this.ack = headers.ack || "auto";
    this.wantExclusive = headers.exclusive === "1";
    this._pendingReceives = 0;
}

Subscription.prototype._setupMessage = function(frame, callback){
    
    var message = {
        id: this.connection.reserveMessageId()
    };
    
    this.connection._pendingReceives += 1;
    this._pendingReceives += 1;
       
    var self = this;
    
    var finish = function(error){
        self.connection._pendingReceives -= 1;
        self._pendingReceives -= 1;
        callback(error, self);
    };
    
    if(this.ack === "auto"){
        frame.on("end", finish);
    }
    else{
        
        var nack = function(){
            finish(new Error("message was rejected by consumer"));
        };
        
        this.connection.bindAckHandlers(message.id, finish, nack);
    }
    
    return message;
};

Subscription.prototype.sendMessage = function(frame, callback){
    
    var message = this._setupMessage(frame, callback);
    
    var output = this.connection.sendFrame("MESSAGE", util.extend(frame.headers, {
        "subscription": this.id,
        "message-id": message.id
    }));
    
    frame.pipe(output);
};

Subscription.prototype.isBusy = function(){
    return this._pendingReceives > 0;
};

function ConsumerPool(){
    this._selected = 0;
    this._consumers = [];
    this._queue = [];
}

ConsumerPool.prototype.addConsumer = function(subscription){
    
    this._consumers.push(subscription);
    
    if(this._queue.length > 0){
        this._queue.shift()();
    }
};

ConsumerPool.prototype.removeConsumer = function(subscription){
    
    var consumers = this._consumers;
    var index = consumers.indexOf(subscription);
    
    if(index === -1){
        return false;
    }
    
    consumers.splice(index, 1);
    
    if(consumers.length > 1){
        this._selected = this._selected % consumers.length;
    }
    else{
        this._selected = 0;
    }
    
    return consumers.length;
};

ConsumerPool.prototype._isSelectedBusy = function(){
    var selectedConsumer = this._consumers[this._selected];
    return (selectedConsumer.isBusy() || (selectedConsumer.wantExclusive && this._selected !== 0));
};

ConsumerPool.prototype.consume = function(frame, callback){
    
    var consumers = this._consumers;
    
    if(consumers.length === 0){
        this._queue.push(this.consume.bind(this, frame, callback));
        return;
    }
    
    var numConsumers = consumers.length;
    
    var selectNext = !consumers[0].wantExclusive;
    if(selectNext){
        
        for(var i = 0; this._isSelectedBusy() && i < numConsumers; i++){
            this._selected = (this._selected + 1) % numConsumers;
        }
        
        if(this._isSelectedBusy()){
            this._queue.push(this.consume.bind(this, frame, callback));
            return;
        }
    }
    
    var self = this;
    
    this._consumers[this._selected].sendMessage(frame, function(error){
        
        if(self._queue.length > 0){
            self._queue.shift()();
        }
        
        callback(error);
    });
    
    if(selectNext){
        this._selected = (this._selected + 1) % numConsumers;
    }
};

module.exports = MessageBus;
