/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const NullWritable = require('../util/NullWritable');

class Subscription {

  constructor(id, ack, onMessageCallback, client) {

      this._id = id;
      this._ack = ack;
      this._onMessageCallback = onMessageCallback;
      this._client = client;
      this._unsubscribing = false;
  }

  getId() {
    return this._id;
  }

  _createMessageObject(frame) {
    
    if (!frame) {
      return;
    }

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

module.exports = Subscription;
