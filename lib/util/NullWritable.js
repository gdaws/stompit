/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.NullWritable
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var stream = require('stream');
var util = require('util');
var crypto = require('crypto');

function NullWritable(hashAlgorithm) {
  stream.Writable.call(this);
  this.bytesWritten = 0;
  this._hash = crypto.createHash(hashAlgorithm || 'md5');
}

util.inherits(NullWritable, stream.Writable);

NullWritable.prototype._write = function(chunk, encoding, callback) {
  this.bytesWritten += chunk.length;
  this._hash.update(chunk);
  callback();
};

NullWritable.prototype.getBytesWritten = function() {
  return this.bytesWritten;  
};

NullWritable.prototype.getHashDigest = function(encoding) {
  return this._hash.digest(encoding);  
};

module.exports = NullWritable;
