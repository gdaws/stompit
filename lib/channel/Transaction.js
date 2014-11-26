/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */
 
var createReadableStream = require('../util').createReadableStream;

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
    
    self._completes.push(complete);
    
    var output = self._transaction.send(headers);
    
    createReadableStream(body).pipe(output);
  });
  
  return this;
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
    
    self._completes.push(complete);
    
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

module.exports = Transaction;
