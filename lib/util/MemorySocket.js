/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.MemorySocket
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var BufferReadWritable  = require('./buffer/BufferReadWritable');
var util                = require('util');
var stream              = require('stream');

function MemorySocket(bufferSize, options) {
  
  stream.Duplex.call(this, options);
  
  bufferSize = bufferSize || 0x4000;
  
  var readWritableOptions = {
    highWaterMark: 0
  };
  
  this._init(
    new BufferReadWritable(Buffer.alloc(bufferSize), readWritableOptions),
    new BufferReadWritable(Buffer.alloc(bufferSize), readWritableOptions)
  );
  
  this._peer = new PeerSocket(this, options);
}

util.inherits(MemorySocket, stream.Duplex);

MemorySocket.prototype._init = function(input, output) {
  
  this._input = input;
  this._output = output;
  
  this.bytesRead = 0;
  this.bytesWritten = 0;
  
  var self = this;
  
  this._input.on('end', function() {
    
    self.push(null);
    
    if (!self._peer._output) {
      self.destroy();
    }
  });
  
  this.on('finish', function() {
    
    self.shutdownOutput();
    
    if (!self._peer._output) {
      self.destroy();
    }
  });
};

MemorySocket.prototype._read = function() {
  
  var readable = this._input;
  
  if (!readable) {
    return;
  }
  
  var chunk = readable.read();
  
  if (chunk !== null) {
    
    this.bytesRead += chunk.length;
    
    this.push(chunk);
  }
  else{
    readable.once('readable', MemorySocket.prototype._read.bind(this));
  }
};

MemorySocket.prototype._write = function(chunk, encoding, callback) {
  
  if (!this._output) {
    callback(new Error('socket is not open'));
    return;
  }
  
  this.bytesWritten += chunk.length;
  
  this._output.write(chunk, encoding, callback);
};

MemorySocket.prototype.getPeerSocket = function() {
  return this._peer;
};

MemorySocket.prototype.destroy = function(exception) {
  
  if (!this._input) {
    return;
  }
  
  this._input = null;
  
  this.shutdownOutput();
  
  var self = this;
  process.nextTick(function() {
    if (exception) {
      self.emit('error', exception);
    }
    self.emit('close', exception ? true : false);
  });
};

MemorySocket.prototype.shutdownOutput = function() {
  
  if (!this._output) {
    return;
  }
  
  this._output = null;
  
  if (this._peer._input) {
    this._peer._input.push(null);
  }
};

function PeerSocket(peer, options) {
  
  stream.Duplex.call(this, options);
  
  this._peer = peer;
  
  this._init(peer._output, peer._input);
}

util.inherits(PeerSocket, MemorySocket);

module.exports = MemorySocket;
