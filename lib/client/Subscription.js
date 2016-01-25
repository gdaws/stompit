/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */
 
var NullWritable = require('../util/NullWritable');
var assign = require('object-assign');

function Subscription(id, ack, onMessageCallback, client) {
  
  this._id = id;
  this._ack = ack;
  this._onMessageCallback = onMessageCallback;
  this._client = client;
  this._unacknowledged = [];
  this._unsubscribing = false;
  
  var self = this;

  function getAckHeaders(message) {
    return {
      'subscription': id,
      'message-id': message.headers['message-id'],
      'id': message.headers.ack
    };
  }
  
  switch(ack) {
    
    case 'auto':
      
      this._sendAck = null;
      
      break;
      
    case 'client':
      
      this._sendAck = function() {
        
        // Send an acknowledgement frame for a batch of consecutive processed
        // messages at the front of the received message queue.
        
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
        
        if ( unacknowledged.length > 0 && 
             unacknowledged[0].ackType !== undefined) {
          
          process.nextTick(self._sendAck.bind(self, null, null, callback));
        }
        
        client.sendFrame(type, getAckHeaders(lastMessage)).end();
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
          else if (typeof callback === 'object') {
            sendOptions = assign(callback, sendOptions);
          }

          client.sendFrame(type, getAckHeaders(message), sendOptions).end();
        }
      };
      
      break;
    
    default:
      throw this.createProtocolError('unknown ack mode');
  }
}

Subscription.prototype.getId = function() {
  return this._id;
};

Subscription.prototype._createMessageObject = function(frame) {
  
  if (!frame) {
    return;
  }

  if (this._sendAck !== null) {

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
  }
  else {

    var noop = function(){};

    frame.ack = noop;
    frame.nack = noop;
  }
  
  return frame;
};

Subscription.prototype.processMessageFrame = function(error, frame) {
  
  if ( this._unsubscribing || 
      (this._client._disconnecting && this._ack !== 'auto') ) {
    
    if (frame) {
      frame.pipe(new NullWritable());
    }
    
    return;
  }
  
  this._onMessageCallback.call(
    this, error, this._createMessageObject(frame), this
  );
};

Subscription.prototype.unsubscribe = function(headers) {
  
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
  
  headers = assign({}, headers, {
    'id': this._id
  });
  
  this._client.sendFrame('UNSUBSCRIBE', headers, {
    onReceipt: function() {
      delete self._client._subscriptions[self._id];
    }
  }).end();
};

module.exports = Subscription;
