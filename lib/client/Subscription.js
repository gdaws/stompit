/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const NullWritable = require('../util/NullWritable');
const { deprecate } = require('util');

class Subscription {

  constructor(id, ack, onMessageCallback, client) {

      this._id = id;
      this._ack = ack;
      this._onMessageCallback = onMessageCallback;
      this._client = client;
      this._unsubscribing = false;
      
      if (ack === 'client') {
        this._unacknowledged = [];
      }

      switch (ack) {

        case 'auto':
          this._sendAck = function() {};
          break;

        case 'client':
          
          this._sendAck = (type, message) => {

            message.ackType = type;

            const unacked = this._unacknowledged;

            const index = unacked.indexOf(message);

            if (index !== 0) {
              return;
            }

            let end = 1;
            for (; end < unacked.length && 
              unacked[end].ackType === message.ackType; end++);
            
            const lastMessage = unacked[end - 1];
            
            unacked.splice(0, end);

            this._sendAckFrame(lastMessage.ackType, lastMessage);

            if (unacked.length > 0 && unacked[0].ackType !== null) {
              const head = unacked[0];
              process.nextTick(this._sendAck.bind(this, head.ackType, head));
            }
          };

          break;

        case 'client-individual':
          this._sendAck = (type, message, callback) => {
            this._sendAckFrame(type, message, callback);
          };
          break;
      }
  }

  getId() {
    return this._id;
  }

  _createMessageObject(frame) {
    
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
  }

  processMessageFrame(error, frame) {
    
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
  }

  unsubscribe(headers) {
    
    if (this._unsubscribing) {
      return;
    }
    
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
    
    headers = Object.assign({}, headers, {
      'id': this._id
    });
    
    this._client.sendFrame('UNSUBSCRIBE', headers, {
      onReceipt: () => {
        delete this._client._subscriptions[this._id];
      }
    }).end();
  }
}

Subscription.prototype._sendAckFrame = deprecate(
  function(type, message, callback) {
    
    let sendOptions = {};

    if (typeof callback === 'function') {
      sendOptions.onReceipt = callback;
      sendOptions.onError = callback;
    }
    else if (typeof callback === 'object') {
      sendOptions = Object.assign(callback, sendOptions);
    }

    const ackFunc = type === 'ACK' ? this._client.ack : this._client.nack;

    ackFunc.call(this._client, message, {}, sendOptions);

  }, 'Stompit: message.ack and message.nack are deprecated; ' + 
     'use client.ack and client.nack instead'
);

module.exports = Subscription;
