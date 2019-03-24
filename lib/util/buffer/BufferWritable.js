/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { Writable } = require('stream');

class BufferWritable extends Writable {

  constructor(buffer, options = {}) {
    
    options.decodeStrings = true;
    
    super(options);

    this._buffer = buffer;
    this._written = 0;
  }

  _write(chunk, encoding, callback) {
    
    if (chunk.length > this._buffer.length - this._written) {
      callback(new Error('would truncate chunk'));
      return;
    }
    
    chunk.copy(this._buffer, this._written, 0, chunk.length);
    
    this._written += chunk.length;
    
    process.nextTick(callback);
  }

  getBuffer() {
    return this._buffer;
  }

  getBytesWritten() {
    return this._written;
  }

  getWrittenSlice() {
    return this._buffer.slice(0, this._written);
  }
}

module.exports = BufferWritable;
