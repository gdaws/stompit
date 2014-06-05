/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */
 
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

module.exports = Transaction;
