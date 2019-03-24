/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { Duplex } = require('stream');

class BufferReadWritable extends Duplex {

  constructor(buffer, options = {}) {

    options.decodeStrings = true;

    super(options);

    this._buffer = buffer;
    
    this._readOffset = 0;
    this._writeOffset = 0;
    
    this._continueRead = null;
    this._continueWrite = null;
    
    const bufferLength = buffer.length;
    
    this._eachInterval = (x, add, callback) => {
      
      if (add === 0) {
        return;
      }
      
      x = x % bufferLength;
      
      const overflow = Math.max(0, (x + add) - bufferLength);
      
      if (overflow > 0) {
        callback.call(this, x, bufferLength);
        callback.call(this, 0, overflow);
      }
      else {
        callback.call(this, x, x + add);
      }
    };
  }

  getBytesReadable() {
    return this._writeOffset - this._readOffset;
  }

  getBytesWritable() {
    return this._buffer.length - this.getBytesReadable();
  }

  getBytesRead() {
    return this._readOffset;
  }

  getBytesWritten() {
    return this._writeOffset;
  }

  _read(n) {
    
    const readable = this.getBytesReadable();
    
    const consume = Math.min(n || readable, readable);
    
    if (consume === 0) {
      
      this._continueRead = function() {
        return BufferReadWritable.prototype._read.call(this, n);
      };
      
      return;
    }
    else {
      this._continueRead = null;
    }
    
    const commitOffset = this._readOffset;
    
    // Update state before calling push
    this._readOffset += consume;
    
    this._eachInterval(commitOffset, consume, function(start, end) {
      const chunk = Buffer.alloc(end - start);
      this._buffer.copy(chunk, 0, start, end);
      return this.push(chunk);
    });
    
    if (this._continueWrite !== null) {
      this._continueWrite.call(this);
    }
  }

  _write(chunk, encoding, callback) {
  
    const writeLength = Math.min(chunk.length, this.getBytesWritable());
    
    const partialWrite = writeLength < chunk.length;
    
    this._eachInterval(this._writeOffset, writeLength, function(start, end) {
      chunk.copy(this._buffer, start, 0, end);
    });
    
    this._writeOffset += writeLength;
    
    if (partialWrite) {
      
      chunk = chunk.slice(writeLength);
      
      this._continueWrite = function() {
        BufferReadWritable.prototype._write.apply(
          this, [chunk, encoding, callback]
        );
      };
    }
    else {
      this._continueWrite = null;
      callback();
    }
    
    if (this._continueRead !== null) {
      this._continueRead.call(this);
    }
  }
}

module.exports = BufferReadWritable;
