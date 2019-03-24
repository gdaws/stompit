/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const BufferReadWritable = require('./buffer/BufferReadWritable');
const { Duplex } = require('stream');

class MemorySocket extends Duplex {

  constructor(bufferSize, options, peer = null) {
    
    super(options);

    bufferSize = bufferSize || 0x4000;
    
    const readWritableOptions = {
      highWaterMark: 0
    };
    
    if (null !== peer) {

      this._peer = peer;

      this._init(peer._output, peer._input);
    }
    else {
      
      this._init(
        new BufferReadWritable(Buffer.alloc(bufferSize), readWritableOptions),
        new BufferReadWritable(Buffer.alloc(bufferSize), readWritableOptions)
      );

      this._peer = new MemorySocket(bufferSize, options, this);
    }
  }

  _init(input, output) {
    
    this._input = input;
    this._output = output;
    
    this.bytesRead = 0;
    this.bytesWritten = 0;
    
    this._input.on('end', () => {
      
      this.push(null);
      
      if (!this._peer._output) {
        this.destroy();
      }
    });
    
    this.on('finish', () => {
      
      this.shutdownOutput();
      
      if (!this._peer._output) {
        this.destroy();
      }
    });
  }

  _read() {
    
    const readable = this._input;
    
    if (!readable) {
      return;
    }
    
    const chunk = readable.read();
    
    if (chunk !== null) {
      
      this.bytesRead += chunk.length;
      
      this.push(chunk);
    }
    else{
      readable.once('readable', MemorySocket.prototype._read.bind(this));
    }
  }

  _write(chunk, encoding, callback) {
    
    if (!this._output) {
      callback(new Error('socket is not open'));
      return;
    }
    
    this.bytesWritten += chunk.length;
    
    this._output.write(chunk, encoding, callback);
  }

  getPeerSocket() {
    return this._peer;
  }

  destroy(exception) {
    
    if (!this._input) {
      return;
    }
    
    this._input = null;
    
    this.shutdownOutput();

    process.nextTick(() => {
      if (exception) {
        this.emit('error', exception);
      }
      this.emit('close', exception ? true : false);
    });
  }

  shutdownOutput() {
    
    if (!this._output) {
      return;
    }
    
    this._output = null;
    
    if (this._peer._input) {
      this._peer._input.push(null);
    }
  }
}

module.exports = MemorySocket;
