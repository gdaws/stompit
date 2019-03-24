/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const Transaction = require('./channel/Transaction');
const { createReadableStream } = require('./util');
const { EventEmitter } = require('events');

class Channel extends EventEmitter {
  
  constructor(connectFailover, options = {}) {

    super();
    
    options = {
      alwaysConnected: false, 
      recoverAfterApplicationError: false, 
      ...options
    };
    
    this._client = null;
    
    this._failover = connectFailover;
    this._connecting = false;
    this._closed = false;
    
    this._transmissions = [];
    this._idle = false;
    this._blockIdle = false;
    
    this._alwaysConnected = options.alwaysConnected;
    this._recoverAfterApplicationError = options.recoverAfterApplicationError;
    
    if (this._alwaysConnected) {
      this._connect(); 
    }
    
    this._checkIdle = Channel.prototype._checkIdle.bind(this); 
  }

  _connect() {
    
    if (this._connecting) {
      return;
    }
    
    this._connecting = true;

    this._connector = this._failover.connect((error, client, reconnect) => {
      
      this._connecting = false;
      
      if (error) {
        this._abort(error);
        return;
      }
      
      client.on('error', (error) => {
        
        if ( !this._recoverAfterApplicationError && 
             error.isApplicationError && error.isApplicationError()) {
          
          this._abort(error);
          return;
        }
        
        this._client = null;
        this._connecting = true;
        
        reconnect();
      });
      
      this._client = client;
      
      this._retransmit();
    });
  }

  _disconnect() {

    const shouldRemainConnected = this._transmissions.length > 0 || 
      (this._alwaysConnected && !this._closed);

    if (this._connecting && this._connector && !shouldRemainConnected) {
      this._connector.abort();
    }

    if (this._client === null || shouldRemainConnected) {
      // Ignore disconnect request
      return;
    }
    
    this._client.disconnect();
    this._client = null;
  }

  _retransmit() {
    
    if (this._closed) {
      
      if (this._transmissions.length > 0) {
        this._abort(new Error('channel is closed'));
      }
      
      this._disconnect();
      
      return;
    }
    
    const client = this._client;
    
    if (client === null) {
      this._connect();
      return;
    }
    
    for (let i = 0; i < this._transmissions.length; i++) {
      
      const transmit = this._transmissions[i];
      
      transmit(null, client, this._createCompletionCallback(transmit));
    }
  }

  _transmit(transmit) {
    
    if (this._closed) {
      transmit(new Error('channel is closed'));
      return;
    }
    
    this._transmissions.push(transmit);
    this._idle = false;
    
    if (this._client === null) {
      
      this._connect();
      
      // The transmit function will be called from the _retransmit method
      // once the client is connected
      
      return;
    }
    
    transmit(null, this._client, this._createCompletionCallback(transmit));
  }

  _createCompletionCallback(transmit) {
    return this._removeTransmission.bind(this, transmit);
  }

  _checkIdle() {

    if (this._blockIdle || this._transmissions.length > 0 || this._idle) {
      return;
    }

    this._idle = true;

    this.emit('idle');
      
    this._disconnect();
  }

  _removeTransmission(transmission) {
    
    for (let i = 0; i < this._transmissions.length; i++) {
      if (this._transmissions[i] === transmission) {
        
        this._transmissions.splice(i, 1);
        
        process.nextTick(this._checkIdle);
        
        return;
      }
    }
  }

  _abort(error) {
    
    if (error) {
      for (let i = 0; i < this._transmissions.length; i++) {   
        this._transmissions[i](error, null, function noop(){});
      }
    }
    
    this._transmissions = [];
  }

  close(error) {
    
    this._abort(error);
    
    this._closed = true;
    
    this._disconnect();
  }

  send(headers, body, callback) {
    
    if(typeof callback !== 'function') {
      callback = function noop() {};
    }
    
    this._transmit(function(error, client, complete) {
      
      if (error) {
        callback(error);
        return;
      }
      
      const onReceipt = function() {
        complete();
        callback(null);
      };
      
      const output = client.send(headers, {onReceipt: onReceipt});
      
      createReadableStream(body).pipe(output);
    });
    
    return this;
  }

  _subscribe(constructor, onMessageCallback) {
    
    const noop = function() {};
    
    let completionCallback = noop;
    let unsubscribe = noop;
    
    let cancelled = false;
    
    const cancel = function() {
      
      if (cancelled) {
        return;
      }
      
      cancelled = true;
      
      onMessageCallback = noop;
      unsubscribe();
      completionCallback();
    };
    
    const channelSubscription = {
      cancel: cancel,
      unsubscribe: cancel
    };
    
    this._transmit(function(error, client, complete) {
      
      if (cancelled) {
        complete();
        return;
      }
      
      if (error) {
        onMessageCallback(error);
        return;
      }
      
      completionCallback = complete;
      
      const subscription = constructor(client, function(subError, message) {
        
        if (subError) {
          // Do nothing here and let the channel reconnect
          return;
        }
        
        onMessageCallback(null, message, channelSubscription);
      });
      
      unsubscribe = subscription.unsubscribe.bind(subscription);
    });
    
    return channelSubscription;
  }

  subscribe(headers, onMessageCallback) {
    return this._subscribe(function(client, onMessageCallback) {
      return client.subscribe(headers, onMessageCallback);
    }, onMessageCallback);
  }

  setImplicitSubscription(id, ack, msgListener) {
    return this._subscribe(function(client, msgListener) {
      return client.setImplicitSubscription(id, ack, msgListener);
    }, msgListener);
  }

  ack() {

    if (this._client === null) {
      return;
    }

    return this._client.ack.apply(this._client, arguments);
  }

  nack() {

    if (this._client === null) {
      return;
    }

    return this._client.nack.apply(this._client, arguments);
  }

  begin(headers) {
    
    const transaction = new Transaction(this);
    
    this._transmit(function(error, client, complete) {
      
      if(error) {
        return;
      }
      
      transaction._completes = [complete];
      
      transaction._transaction = client.begin(headers);
    });
    
    return transaction;
  }

  isEmpty() {
    return this._transmissions.length === 0;  
  }

  lock() {
    this._idle = false;
    this._blockIdle = true;
  }

  unlock() {
    
    this._blockIdle = false;
    
    this._checkIdle();
  }
}

module.exports = Channel;
