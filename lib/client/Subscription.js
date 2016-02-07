/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */
 
var NullWritable = require('../util/NullWritable');
var assign = require('object-assign');
var util = require('util');

function Subscription(id, ack, onMessageCallback, client) {
  
  this._id = id;
  this._ack = ack;
  this._onMessageCallback = onMessageCallback;
  this._client = client;
  this._unsubscribing = false;
  
  var self = this;
  
  if (ack === 'client') {
    this._unacknowledged = [];
  }

  switch (ack) {

    case 'auto':
      this._sendAck = function() {};
      break;

    case 'client':
      
      this._sendAck = function(type, message) {

        message.ackType = type;

        var unacknowledged = self._unacknowledged;

        var index = unacknowledged.indexOf(message);

        if (index !== 0) {
          return;
        }

        var end = 1;
        for (; end < unacknowledged.length && 
          unacknowledged[end].ackType === message.ackType; end++);
        
        var lastMessage = unacknowledged[end - 1];
        
        unacknowledged.splice(0, end);

        self._sendAckFrame(lastMessage.ackType, lastMessage);

        if (unacknowledged.length > 0 && unacknowledged[0].ackType !== null) {
          var head = unacknowledged[0];
          process.nextTick(this._sendAck.bind(this, head.ackType, head));
        }
      };

      break;

    case 'client-individual':
      this._sendAck = function(type, message, callback) {
        self._sendAckFrame(type, message, callback);
      };
      break;
  }
}

Subscription.prototype._sendAckFrame = util.deprecate(
  function(type, message, callback) {
    
    var sendOptions = {};

    if (typeof callback === 'function') {
      sendOptions.onReceipt = callback;
      sendOptions.onError = callback;
    }
    else if (typeof callback === 'object') {
      sendOptions = assign(callback, sendOptions);
    }

    var ackFunc = type === 'ACK' ? this._client.ack : this._client.nack;

    ackFunc.call(this._client, message, {}, sendOptions);

  }, 'Stompit: message.ack and message.nack are deprecated; ' + 
     'use client.ack and client.nack instead'
);

Subscription.prototype.getId = function() {
  return this._id;
};

Subscription.prototype._createMessageObject = function(frame) {
  
  if (!frame) {
    return;
  }

  if (this._ack === 'client') {
    this._unacknowledged.push(frame);
    frame.ackType = null;
  }

  frame.ack = this._sendAck.bind(this, 'ACK', frame);
  frame.nack = this._sendAck.bind(this, 'NACK', frame);

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
