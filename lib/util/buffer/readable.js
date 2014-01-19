/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.BufferReadable
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var util    = require('util');
var stream  = require('stream');

function BufferReadable(buffer, options) {
  
  this._buffer = buffer;
  this._offset = 0;
  
  stream.Readable.call(this, options);
}

util.inherits(BufferReadable, stream.Readable);

BufferReadable.prototype._read = function(size) {
  
  size = Math.min(size, this._buffer.length - this._offset);
  
  if (size === 0) {
    this.push(null);
    return;
  }
  
  this.push(this._buffer.slice(this._offset, this._offset + size));
  
  this._offset += size;
};

BufferReadable.prototype.getBytesRead = function() {
  return this._offset;
};

BufferReadable.prototype.getBuffer = function() {
  return this._buffer;
};

module.exports = BufferReadable;
