/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */

var stream         = require('stream');
var BufferReadable = require('./util/buffer/BufferReadable');

function createReadableStream(body) {
  
  var readable = (typeof body === 'function' ? body() : body);
  
  if (!(readable instanceof stream.Readable)) {
    
    var buffer = readable;
    
    if (!(buffer instanceof Buffer)) {
      buffer = Buffer.from(readable);
    }
    
    readable = new BufferReadable(buffer);
  }
  
  return readable;
}

module.exports = {
  createReadableStream: createReadableStream
};
