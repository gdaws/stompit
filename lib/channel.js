/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.Channel
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var BufferReadable  = require('./util/buffer/readable');
var stream          = require('stream');

function Channel(connectFailover) {
  
  this._client = null;
  
  this._connectFailover = connectFailover;
  this._connecting = false;
  
  this._transmissions = [];
}

Channel.prototype._connect = function() {
  
  if (this._connecting) {
    return;
  }
  
  this._connecting = true;
  
  var self = this;
  
  this._connectFailover.connect(function(error, client, reconnect) {
    
    self._connecting = false;
    
    if (error) {
      self._abort(error);
      return;
    }
    
    client.on('error', function() {
      
      self._client = null;
      self._connecting = true;
      
      reconnect();
    });
    
    self._client = client;
    
    self._retransmit();
  });
};

Channel.prototype._disconnect = function() {

  var self = this;
  
  process.nextTick(function() {
  
    if (self._client === null || self._transmissions.length > 0) {
      return;
    }
    
    self._client.disconnect();
    self._client = null;
  });
};

Channel.prototype._retransmit = function() {
  
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
  
  this._transmissions.push(transmit);
  
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

Channel.prototype._removeTransmission = function(transmission) {
  
  for (var i = 0; i < this._transmissions.length; i++) {
    if (this._transmissions[i] === transmission) {
      
      this._transmissions.splice(i, 1);
      
      if(this._transmissions.length === 0) {
        this._disconnect();
      }
      
      return;
    }
  }
};

Channel.prototype._abort = function(error) {
  
  var noop = function() {};
  
  for (var i = 0; i < this._transmissions.length; i++) {   
    this._transmissions[i](error, null, noop);
  }
  
  this._transmissions = [];
};

function createReadableStream(body) {
  
  var readable = (typeof body === 'function' ? body() : body);
  
  if (!(readable instanceof stream.Readable)) {
    
    var buffer = readable;
    
    if (!(buffer instanceof Buffer)) {
      buffer = new Buffer(readable);
    }
    
    readable = new BufferReadable(buffer);
  }
  
  return readable;
}

Channel.prototype.close = function() {
  
  this._abort(new Error('closing channel'));
  
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

Channel.prototype.subscribe = function(headers, onMessageCallback) {
  
  var completionCallback = function(){};
  var unsubscribe = function(){};
  
  var cancel = function() {
    onMessageCallback = function() {};
    unsubscribe();
    completionCallback();
  };
  
  this._transmit(function(error, client, complete) {
    
    if (error) {
      onMessageCallback(error);
      return;
    }
    
    completionCallback = complete;
    
    var subscription = client.subscribe(headers, function(subError, message) {
      
      if (subError) {
        // Do nothing here and let the channel reconnect
        return;
      }
      
      onMessageCallback(null, message);
    });
    
    unsubscribe = subscription.unsubscribe.bind(subscription);
  });
  
  return {
    cancel: cancel
  };
};

function Transaction(channel) {
  this._channel = channel;
  this._completes = [];
  this._transaction = null;
}

Transaction.prototype.send = function(headers, body) {
  
  var self = this;
  
  this._channel._transmit(function(error, client, complete) {
    
    if (error) {
      // Do nothing here and let the user handle an error on commit
      return;
    }
    
    this._completes.push(complete);
    
    var output = self._transaction.send(headers);
    
    createReadableStream(body).pipe(output);
  });
};

Transaction.prototype.abort = function() {
  
  var self = this;
  
  this._channel._transmit(function(error, client, complete) {
    
    if (error) {
      return;
    }
    
    self._transaction.abort();
    
    // We can complete now since none of the messages will have to be re-sent
    
    self._completes.push(complete);
    self._completed();
  });
};

Transaction.prototype.commit = function(callback) {
  
  var self = this;
  
  this._channel._transmit(function(error, client, complete) {
    
    if (error) {
      callback(error);
      return;
    }
    
    this._completes.push(complete);
    
    self._transaction.commit({
      onReceipt: function() {
        callback(null);
        self._completed();
      }
    });
  });
};

Transaction.prototype._completed = function() {
  
  for (var i = 0; i < this._completes.length; i++) {
    this._completes[i]();
  }
  
  this._completes = [];
};

Channel.prototype.begin = function(headers) {
  
  var transaction = new Transaction(this);
  
  this._channel._transmit(function(error, client, complete) {
    
    if(error) {
      return;
    }
    
    transaction._completes = [complete];
    
    transaction._transaction = client.begin(headers);
  });
  
  return transaction;
};

module.exports = Channel;
