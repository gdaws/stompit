/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.Client
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var Socket          = require('./socket');
var BufferWritable  = require('./util/buffer/writable');
var NullWritable    = require('./util/nullwritable');
var util            = require('./util');

var ERROR_MAX_CONTENT_LENGTH = 4096;

// STOMP client connection
function Client(transportSocket, options) {
  
  options = util.extend({
    commandHandlers: {},
    unknownCommand: onUnknownCommand
  }, options);
  
  Socket.call(this, transportSocket, options);
  
  this._receipts = {};
  this._nextReceiptId = 1;
  
  this._subscriptions = {};
  this._nextSubcriptionId = 1;
  
  this._nextTransactionId = 1;
  
  this._disconnecting = false;  
  this._hasDisconnectReceipt = false;
}

util.inherits(Client, Socket);

Client.prototype._onInputEnd = function() {
  
  if (this._hasDisconnectReceipt) {
    this.emit('end');
    this.destroy();
  }
  else {
    
    var errorMessage = this.hasFinishedOutput() ? 
      'connection ended without disconnect receipt' : 
      'connection ended unexpectedly';
    
    this.destroy(this.createProtocolError(errorMessage));
  }
};

Client.prototype._beforeSendResponse = function() {
  // No interception of outgoing frame
};

/*
 * Create frame to send to the server. This method returns a Writable stream
 * object for sending the frame body content.
 */
Client.prototype.sendFrame = function(command, headers, options) {
  
  if (options) {
    
    var onReceipt = options.onReceipt;
    
    if (typeof options.onError === 'function') {
      
      var originalOnReceipt = onReceipt || function(){};
      
      var onError = options.onError;
      
      this.on('error', onError);
      
      var self = this;
      onReceipt = function() {
        self.removeListener('error', onError);
        originalOnReceipt();
      };
    }
    
    if (typeof onReceipt === 'function') {
      
      var id = this._nextReceiptId++;
      
      this._receipts[id] = onReceipt;
      
      headers.receipt = id;
    }
  }
  
  return Socket.prototype.sendFrame.apply(this, arguments);
};

/*
 * Send CONNECT frame to the server.
 */
Client.prototype.connect = function(headers, callback) {
  
  if (typeof headers === 'string') {
    headers = {'host': headers};
  }
  
  headers = util.extend(headers, {
    'accept-version': '1.0,1.1,1.2'
  });
  
  var heartbeat = this.getHeartbeat();
  
  if (typeof headers['heart-beat'] === "string") {
    var match = headers['heart-beat'].match(/^(\d+) *, *(\d+)$/);
    if (match) {
      heartbeat = [parseInt(match[1], 10), parseInt(match[1], 10)];
      this.setHeartbeat(heartbeat);
    }
  }
  
  headers['heart-beat'] = heartbeat[0] + "," + heartbeat[1];
  
  this.setCommandHandlers({
    'CONNECTED': onConnected,
    'ERROR': onError
  });
  
  if (typeof callback === 'function') {
    
    var self = this;
    
    (function() {
      
      var onConnected = function(client) {
        cleanup();
        callback(null, client);
      };
      
      var onError = function(error) {
        cleanup();
        callback(error);
      };
      
      var cleanup = function() {
        self.removeListener('error', onError);
        self.removeListener('connect', onConnected);
      };
      
      self.on('error', onError);
      self.on('connect', onConnected);
    })();
  }
  
  var frame = this.sendFrame('CONNECT', headers);
  
  frame.end();
};

/*
 * Send a message to the server. This method returns a Writable stream object 
 * for sending the frame body content.
 */
Client.prototype.send = function(headers, options) {
  
  if (typeof headers === 'string') {
    headers = {destination: headers};
  }
  
  return this.sendFrame('SEND', headers, options);
};

Client.prototype.begin = function(headers) {
  
  if (typeof headers !== 'object') {
    if (typeof headers !== 'undefined') {
      headers = {transaction: headers};
    }
    else {
      headers = {};
    }
  }
  
  if (!('transaction' in headers)) {
    headers.transaction = this._nextTransactionId++;
  }
  
  var transaction = new Transaction(headers.transaction, this);
  
  this.sendFrame('BEGIN', headers).end();
  
  return transaction;
};

Client.prototype.subscribe = function(headers, messageListener) {
  
  if (typeof headers === 'string') {
    headers = {destination: headers};
  }
  
  var id = headers.id !== undefined ? headers.id : this._nextSubcriptionId++;
  
  while (this._subscriptions[id] !== undefined) {
    id = this._nextSubcriptionId++;
  }
  
  headers.id = id;
  
  var ack = headers.ack;
  
  if (typeof ack === 'undefined') {
    ack = 'auto';
  }
  
  var validAckModes = [
    'auto', 'client', 'client-individual'
  ];
  
  if (validAckModes.indexOf(ack) === -1 ) {
    throw new Error('invalid ack mode');
  }
  
  var subscription = new Subscription(id, ack, messageListener, this);
  
  this._subscriptions[id] = subscription;
  
  this.sendFrame('SUBSCRIBE', headers).end();
  
  return subscription;
};

Client.prototype.getSubscription = function(id) {
  return this._subscriptions[id];
};

/*
 * Perform graceful disconnect from server. This operation does not complete
 * until all messages are acknowledged.
 */
Client.prototype.disconnect = function(callback) {
  
  var self = this;
  
  if (typeof callback === 'function') {
    (function() {
      
      var onEnd = function(client) {
        cleanup();
        callback(null, client);
      };
      
      var onError = function(error) {
        cleanup();
        callback(error);
      };
      
      var cleanup = function() {
        self.removeListener('end', onEnd);
        self.removeListener('error', onError);
      };
      
      self.on('end', onEnd);
      self.on('error', onError);
    })();
  }
  
  this.sendFrame('DISCONNECT', {}, {
    onReceipt: function() {
      self._hasDisconnectReceipt = true;
      self.getTransportSocket().end();
    }
  }).end(this._finishOutput.bind(this));
  
  // Keep the transport output open until the receipt is processed just in case
  // the transport is not configured to handle half-open connections.
  
  this._disconnecting = true;
};

Client.prototype.readEmptyBody = function(frame, callback) {
  
  var self = this;
  
  frame.readEmptyBody(function(isEmpty) {
    
    if (isEmpty) {
      if (typeof callback === 'function') {
        callback.call(self);
      }
    }
    else {
      self.destroy(this.createProtocolError('expected empty body frame'));
    }
  });
};

function onConnected(frame, beforeSendResponse) {
  
  // If no version header is present then assume the server is running stomp 1.0
  // protocol
  this.setVersion(frame.headers.version || '1.0');
  
  this.setCommandHandlers({
    'MESSAGE': onMessage,
    'RECEIPT': onReceipt,
    'ERROR': onError
  });
  
  var self = this;
  
  this.readEmptyBody(frame, function() {
    
    if (frame.headers['heart-beat'] !== undefined) {
      
      var heartbeat = frame.headers['heart-beat']
        .split(',').map(function(x) {
          return parseInt(x, 10);
        });
      
      if ( heartbeat.length > 1 && 
           !isNaN(heartbeat[0]) && 
           !isNaN(heartbeat[1]) ) {
        
        this._runHeartbeat(heartbeat[0], heartbeat[1]);
      }
    }
    
    self.headers = frame.headers;
    
    self.emit('connect', self);
    
    beforeSendResponse();
  });
}

function onError(frame) {
  
  var message = 'received ERROR frame';
  
  if (frame.headers.message) {
    message += ' with message \'' + frame.headers.message + '\'';
  }
  
  var error = this.createApplicationError(message);
    
  if ( frame.headers['content-type'] === 'text/plain' && 
      frame.headers['content-length'] <= ERROR_MAX_CONTENT_LENGTH) {
    
    var content = new BufferWritable(new Buffer(ERROR_MAX_CONTENT_LENGTH));
    
    var self = this;
    
    frame.on('end', function() {
      error.longMessage = content.getWrittenSlice().toString();
      self.destroy(error);
    });
    
    frame.pipe(content);
  }
  else {
    this.destroy(error);
  }
}

function onMessage(frame, beforeSendResponse) {
  
  var subId = frame.headers.subscription;
  
  var subscription = this._subscriptions[subId];
  
  if (subscription === undefined) {
    this.destroy(this.createProtocolError('invalid subscription'));
  }
  
  subscription.processMessageFrame(frame);
  
  beforeSendResponse();
}

function onReceipt(frame, beforeSendResponse) {
  
  var id = frame.headers['receipt-id'];
  
  if (id === undefined || this._receipts[id] === undefined) {
    this.destroy(this.createProtocolError('invalid receipt'));
    return;
  }
  
  this.readEmptyBody(frame, function() {
    this._receipts[id].call(this);
    delete this._receipts[id];
    beforeSendResponse();
  });
}

function onUnknownCommand(frame) {
  this.destroy(this.createProtocolError(
    'unknown command \'' + frame.command + '\''
  ));
}

function Subscription(id, ack, onMessageCallback, client) {
  
  this._id = id;
  this._ack = ack;
  this._onMessageCallback = onMessageCallback;
  this._client = client;
  this._unacknowledged = [];
  this._unsubscribing = false;
  
  var self = this;
  
  this._onError = function(error) {
    self._removeErrorHandler();
    self._onMessageCallback(error);
  };
  
  client.on('error', this._onError);
  
  function getAckHeaders(message) {
    return {
      'subscription': id,
      'message-id': message.headers['message-id'],
      'id': message.headers.ack
    };
  }
  
  switch(ack) {
    
    case 'auto':
      
      this._sendAck = function(unused1, unused2, callback) {
        
        self._unacknowledged = [];
        
        if (typeof callback === 'function') {
          process.nextTick(callback);
        }
      };
      
      break;
      
    case 'client':
      
      this._sendAck = function(unused1, unused2, callback) {
        
        var unacknowledged = self._unacknowledged;
        
        var length = unacknowledged.length;
        if (length < 1) {
          return;
        }
        
        var type = unacknowledged[0].ackType;
        if (type === undefined) {
          return;
        }
        
        var end = 1;
        for (; end < length && unacknowledged[end].ackType === type; end++);
         
        var lastMessage = unacknowledged[end - 1];
        
        unacknowledged.splice(0, end);
        
        var sendOptions = {};
        
        if ( unacknowledged.length > 0 && 
             unacknowledged[0].ackType !== undefined) {
          
          process.nextTick(self._sendAck.bind(self, null, null, callback));
        }
        else {
          if (typeof callback === 'function') {
            sendOptions.onReceipt = callback;
            sendOptions.onError = callback;
          }
        }
        
        client.sendFrame(type, getAckHeaders(lastMessage), sendOptions).end();
      };
      
      break;
      
    case 'client-individual':
      
      this._sendAck = function(type, message, callback) {
         
        var index = self._unacknowledged.indexOf(message);
        
        if (index !== -1) {
          
          self._unacknowledged.splice(index, 1);
          
          var sendOptions = {};
          
          if (typeof callback === 'function') {
            sendOptions.onReceipt = callback;
            sendOptions.onError = callback;
          }
          
          client.sendFrame(type, getAckHeaders(message), sendOptions).end();
        }
      };
      
      break;
    
    default:
      throw this.createProtocolError('unknown ack mode');
  }
}

Subscription.prototype._removeErrorHandler = function() {
  if (this._onError) {
    this._client.removeListener('error', this._onError);
    delete this._onError;
  }  
};

Subscription.prototype.getId = function() {
  return this._id;
};

Subscription.prototype._createMessageObject = function(frame) {
  
  var self = this;
  
  var createAckFunction = function(type) {
    return function(callback) {
      this.ackType = type;
      self._sendAck(type, this, callback);
    };
  };
  
  frame.ack = createAckFunction('ACK');
  frame.nack = createAckFunction('NACK');
  
  this._unacknowledged.push(frame);
  
  return frame;
};

Subscription.prototype.processMessageFrame = function(frame) {
  
  if ( this._unsubscribing || 
      (this._client._disconnecting && this._ack !== 'auto') ) {
    
    frame.pipe(new NullWritable());
    return;
  }
  
  this._onMessageCallback.call(
    this, null, this._createMessageObject(frame), this
  );
};

Subscription.prototype.unsubscribe = function() {
  
  if (this._unsubscribing) {
    return;
  }
  
  var self = this;
  
  this._unsubscribing = true;
  
  // Prevent ACK or NACK frames being sent after unsubscribe
  this._sendAck = function(unused1, unused2, callback) {
    
    if (typeof callback === 'function') {
      
      if (this._ack === 'auto') {
        process.nextTick(callback);
      }
      else {
        process.nextTick(function() {
          callback(new Error('subscription closed'));
        });
      }
    }
  };
  
  var headers = {
    'id': this._id
  };
  
  this._removeErrorHandler();
  
  this._client.sendFrame('UNSUBSCRIBE', headers, {
    onReceipt: function() {
      delete self._client._subscriptions[self._id];
    }
  }).end();
};

function Transaction(id, client) {
  this._client = client;
  this.id = id;
}

// Send a message to the server
Transaction.prototype.send = function() {
  var frame = this._client.send.apply(this._client, arguments);
  frame.headers.transaction = this.id;
  return frame;
};

Transaction.prototype.abort = function(options) {
  
  this._client.sendFrame('ABORT', {
    transaction: this.id
  }, options).end();
};

Transaction.prototype.commit = function(options) {
  
  this._client.sendFrame('COMMIT', {
    transaction: this.id
  }, options).end();
};

module.exports = Client;
