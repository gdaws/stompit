/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { Writable } = require('stream');

class OutgoingFrameStream {

  constructor(destination) {

    this._destination = destination;
    this._destinationFinished = false;
    
    this._writing = false;
    
    const finish = this.finish.bind(this);
    
    destination.on('error', finish);
    destination.on('close', finish);
    destination.on('finish', finish);
    
    destination.on('drain', service.bind(null, this));
    
    this._frame = null;
    this._queue = [];

    this.setVersion('1.0');
  }

  setVersion(versionId) {

    const v10Encode = createEncodeFunction([]);

    const v11Encode = createEncodeFunction([
      [/\\/g, '\\\\'],
      [/\n/g, '\\n'],
      [/:/g, '\\c']
    ]);

    const v12Encode = createEncodeFunction([
      [/\\/g, '\\\\'],
      [/\r/g, '\\r'],
      [/\n/g, '\\n'],
      [/:/g, '\\c']
    ]);

    const encoders = {
      '1.0': v10Encode,
      '1.1': v11Encode,
      '1.2': v12Encode
    };

    const encoder = encoders[versionId];

    if (typeof encoder === 'undefined') {
      return false;
    }

    this._encode = encoder;

    return true;
  }

  _queueFrame(frame) {
    
    if (this._frame === null) {
      this._frame = frame;
    }
    else {
      this._queue.push(frame);
    }
    
    return frame;
  }

  frame(command, headers, streamOptions) {

    return this._queueFrame(new Frame(this, command, headers, streamOptions));
  }

  heartbeat() {
    
    if (this._frame) {
      return;
    }
    
    this._destination.write('\n', 'utf8');
  }

  finish() {
    this._destinationFinished = true;
  }

  hasFinished() {
    return this._destinationFinished;
  }
}

class Frame extends Writable {

  constructor(stream, command, headers, streamOptions) {

    super(streamOptions);
  
    this._stream = stream;
    this._writes = [];
    this._write = this._writeHeaderAndBody;
    
    this.command = command;
    this.headers = headers || {};
  }

  end(chunk, encoding, cb) {
    
    if (typeof chunk === 'function') {
      cb = chunk;
      chunk = null;
      encoding = null;
    } else if (typeof encoding === 'function') {
      cb = encoding;
      encoding = null;
    }
    
    if (chunk !== undefined && chunk !== null) {
      this.write(chunk, encoding, (error) => {
        
        if (error && cb) {
          cb(error);
          return;
        }
        
        this._endFrame(cb);
      });
    }
    else {
      this._endFrame(cb);
    }
  }

  _endFrame(cb) {
    
    this.write('\x00\n', 'utf-8', (error) => {
      
      if (cb) {
        cb(error);
      }
      
      // Ready to send the next frame
      dequeue(this._stream);
      
      Writable.prototype.end.apply(this);
    });
  }

  _writeHeaderAndBody(chunk, encoding, cb) {
    
    this._writeHeader();
    this._writeBody(chunk, encoding, cb);
  }

  _writeHeader(cb) {
    
    let header = this._stream._encode(this.command) + '\n';
    
    for (let key in this.headers) {
      
      const value = this.headers[key];
      
      if (value !== null && value !== undefined) {
        header += this._stream._encode(key) + ':' +
          this._stream._encode(value) + '\n';
      }
    }
    
    header += '\n';
    
    this._pushWriteRequest(header, 'utf-8', cb);
    
    this._write = this._writeBody;
  }

  _writeBody(chunk, encoding, cb) {
    
    this._pushWriteRequest(chunk, encoding, cb);
    
    service(this._stream);
  }

  _pushWriteRequest(chunk, encoding, cb) {
    
    this._writes.push({
      chunk: chunk,
      encoding: encoding,
      cb: cb || function() {}
    });
  }
}

function service(stream) {
  
  if (stream._writing || stream._frame === null || 
      stream._frame._writes.length < 1) return;
  
  if (stream._destinationFinished) {
    const error = new Error('cannot send frame on closed stream');
    stream._frame.emit('error', error);
    dequeue(stream);
    return;
  }
  
  const frame = stream._frame;
  const writeOp = frame._writes.shift();
  
  const chunk = writeOp.chunk;
  const encoding = writeOp.encoding;

  function onWriteFlush(error) {
    
    stream._writing = false;
    
    if (error && frame.emit) {
      frame.emit('error', error);
    }
    
    writeOp.cb(error);
    
    // The write cb may have called dequeue
    
    if (!error) {
      // Attempt next write operation
      service(stream);
    }
    else {
      // Send errors to subsequent write cbs and let the next
      // frame attempt to write and cause an error
      dequeue(stream);
    }
  }
  
  if (!stream._destination.write(chunk, encoding, onWriteFlush)){
    stream._writing = true;
  }
}

function dequeue(stream) {
  
  if (stream._frame) {
    stream._frame._write = errorOnWrite;
  }
  
  if (stream._queue.length > 0) {
    stream._frame = stream._queue.shift();
  }
  else {
    stream._frame = null;
  }
  
  service(stream);
}

function createEncodeFunction(escapeSequences) {
  return function(value) {
    value = '' + value;

    for (let i = 0; i < escapeSequences.length; i++) {
      value = value.replace(escapeSequences[i][0], escapeSequences[i][1]);
    }

    return value;
  };
}

function errorOnWrite(chunk, encoding, cb) {
  cb(new Error('cannot write on closed stream'));
}

module.exports = OutgoingFrameStream;
