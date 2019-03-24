/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { Readable } = require('stream');

class BufferReadable extends Readable {

  constructor(buffer, options) {
    
    super(options);

    this._buffer = buffer;
    this._offset = 0;
  }

  _read(size) {
    
    size = Math.min(size, this._buffer.length - this._offset);
    
    if (size === 0) {
      this.push(null);
      return;
    }
    
    this.push(this._buffer.slice(this._offset, this._offset + size));
    
    this._offset += size;
  }

  getBytesRead() {
    return this._offset;
  }

  getBuffer() {
    return this._buffer;
  }
}

module.exports = BufferReadable;
