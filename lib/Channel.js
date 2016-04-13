/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.Channel
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var Transaction = require('./channel/Transaction');
var util = require('util');
var assign = require('object-assign');
var createReadableStream = require('./util').createReadableStream;
var events = require('events');

function Channel(connectFailover, options) {
  
  events.EventEmitter.call(this);
  
  options = assign({
    
    alwaysConnected: false,
    
    recoverAfterApplicationError: false
    
  }, options || {});
  
  this._client = null;
  
  this._connectFailover = connectFailover;
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

util.inherits(Channel, events.EventEmitter);

Channel.prototype._connect = function() {
  
  if (this._connecting) {
    return;
  }
  
  this._connecting = true;
  
  var self = this;
  
  this._connector = 
    this._connectFailover.connect(function(error, client, reconnect) {
    
    self._connecting = false;
    
    if (error) {
      self._abort(error);
      return;
    }
    
    client.on('error', function(error) {
      
      if ( !self._recoverAfterApplicationError && 
           error.isApplicationError && error.isApplicationError()) {
        
        self._abort(error);
        return;
      }
      
      self._client = null;
      self._connecting = true;
      
      reconnect();
    });
    
    self._client = client;
    
    self._retransmit();
  });
};

Channel.prototype._disconnect = function() {

  var shouldRemainConnected = this._transmissions.length > 0 || 
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
};

Channel.prototype._retransmit = function() {
  
  if (this._closed) {
    
    if (this._transmissions.length > 0) {
      this._abort(new Error('channel is closed'));
    }
    
    this._disconnect();
    
    return;
  }
  
  var client = this._client;
  
  if (client === null) {
    this._connect();
    return;
  }
  
  for (var i = 0; i < this._transmissions.length; i++) {
    
    var transmit = this._transmissions[i];
    
    transmit(null, client, this._createCompletionCallback(transmit));
  }
};

Channel.prototype._transmit = function(transmit) {
  
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
};

Channel.prototype._createCompletionCallback = function(transmit) {
  return this._removeTransmission.bind(this, transmit);
};

Channel.prototype._checkIdle = function() {
  
  if (this._blockIdle || this._transmissions.length > 0 || this._idle) {
    return;
  }
  
  this._idle = true;
  
  this.emit('idle');
    
  this._disconnect();
};

Channel.prototype._removeTransmission = function(transmission) {
  
  for (var i = 0; i < this._transmissions.length; i++) {
    if (this._transmissions[i] === transmission) {
      
      this._transmissions.splice(i, 1);
      
      process.nextTick(this._checkIdle);
      
      return;
    }
  }
};

Channel.prototype._abort = function(error) {
  
  if (error) {
    
    var noop = function() {};
    
    for (var i = 0; i < this._transmissions.length; i++) {   
      this._transmissions[i](error, null, noop);
    }
  }
  
  this._transmissions = [];
};

Channel.prototype.close = function(error) {
  
  this._abort(error);
  
  this._closed = true;
  
  this._disconnect();
};

Channel.prototype.send = function(headers, body, callback) {
  
  if(typeof callback !== 'function') {
    callback = function() {};
  }
  
  this._transmit(function(error, client, complete) {
    
    if (error) {
      callback(error);
      return;
    }
    
    var onReceipt = function() {
      complete();
      callback(null);
    };
    
    var output = client.send(headers, {onReceipt: onReceipt});
    
    createReadableStream(body).pipe(output);
  });
  
  return this;
};

Channel.prototype._subscribe = function(constructor, onMessageCallback) {
  
  var noop = function() {};
  
  var completionCallback = noop;
  var unsubscribe = noop;
  
  var cancelled = false;
  
  var cancel = function() {
    
    if (cancelled) {
      return;
    }
    
    cancelled = true;
    
    onMessageCallback = noop;
    unsubscribe();
    completionCallback();
  };
  
  var channelSubscription = {
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
    
    var subscription = constructor(client, function(subError, message) {
      
      if (subError) {
        // Do nothing here and let the channel reconnect
        return;
      }
      
      onMessageCallback(null, message, channelSubscription);
    });
    
    unsubscribe = subscription.unsubscribe.bind(subscription);
  });
  
  return channelSubscription;
};

Channel.prototype.subscribe = function(headers, onMessageCallback) {
  return this._subscribe(function(client, onMessageCallback) {
    return client.subscribe(headers, onMessageCallback);
  }, onMessageCallback);
};

Channel.prototype.setImplicitSubscription = function(id, ack, msgListener) {
  return this._subscribe(function(client, msgListener) {
    return client.setImplicitSubscription(id, ack, msgListener);
  }, msgListener);
};

Channel.prototype.ack = function() {

  if (this._client === null) {
    return;
  }

  return this._client.ack.apply(this._client, arguments);
};

Channel.prototype.nack = function() {

  if (this._client === null) {
    return;
  }

  return this._client.nack.apply(this._client, arguments);
};

Channel.prototype.begin = function(headers) {
  
  var transaction = new Transaction(this);
  
  this._transmit(function(error, client, complete) {
    
    if(error) {
      return;
    }
    
    transaction._completes = [complete];
    
    transaction._transaction = client.begin(headers);
  });
  
  return transaction;
};

Channel.prototype.isEmpty = function() {
  return this._transmissions.length === 0;  
};

Channel.prototype.lock = function() {
  this._idle = false;
  this._blockIdle = true;
};

Channel.prototype.unlock = function() {
  
  this._blockIdle = false;
  
  this._checkIdle();
};

module.exports = Channel;
