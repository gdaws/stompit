/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.BufferWritable
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var util    = require('util');
var Stream  = require('stream');

function BufferWritable(buffer, options) {
  
  options = options || {};
  
  options.decodeStrings = true;
  
  Stream.Writable.call(this, options);
  
  this._buffer = buffer;
  this._written = 0;
}

util.inherits(BufferWritable, Stream.Writable);

BufferWritable.prototype._write = function(chunk, encoding, callback) {
  
  if (chunk.length > this._buffer.length - this._written) {
    callback(new Error('would truncate chunk'));
    return;
  }
  
  chunk.copy(this._buffer, this._written, 0, chunk.length);
  
  this._written += chunk.length;
  
  process.nextTick(callback);
};

BufferWritable.prototype.getBuffer = function() {
  return this._buffer;
};

BufferWritable.prototype.getBytesWritten = function() {
  return this._written;
};

BufferWritable.prototype.getWrittenSlice = function() {
  return this._buffer.slice(0, this._written);
};

module.exports = BufferWritable;
