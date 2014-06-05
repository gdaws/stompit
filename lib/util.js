/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit utility functions
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var util           = require('util');
var stream         = require('stream');
var BufferReadable = require('./util/buffer/BufferReadable');

function extend(destination) {
  
  var argc = arguments.length;
  
  for (var i = 1; i < argc; i++) {
    
    var source = arguments[i];
    
    if (source) {
      for (var key in source) {
        destination[key] = source[key];
      }
    }
  }
  
  return destination;
}

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

module.exports = extend(util, {
  extend: extend,
  createReadableStream: createReadableStream
});
