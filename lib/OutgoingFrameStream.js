/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.OutgoingFrameStream
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var util    = require('util');
var Stream  = require('stream');

function OutgoingFrameStream(destination) {
  
  this._destination = destination;
  this._destinationFinished = false;
  
  this._writing = false;
  
  var finish = this.finish.bind(this);
  
  destination.on('error', finish);
  destination.on('close', finish);
  destination.on('finish', finish);
  
  destination.on('drain', service.bind(null, this));
  
  this._frame = null;
  this._queue = [];

  this.setVersion('1.0');
}

OutgoingFrameStream.prototype.setVersion = function(versionId) {

  var v10Encode = createEncodeFunction([]);

  var v11Encode = createEncodeFunction([
    [/\\/g, '\\\\'],
    [/\n/g, '\\n'],
    [/:/g, '\\c']
  ]);

  var v12Encode = createEncodeFunction([
    [/\\/g, '\\\\'],
    [/\r/g, '\\r'],
    [/\n/g, '\\n'],
    [/:/g, '\\c']
  ]);

  var encoders = {
    '1.0': v10Encode,
    '1.1': v11Encode,
    '1.2': v12Encode
  };

  var encoder = encoders[versionId];

  if (typeof encoder === 'undefined') {
    return false;
  }

  this._encode = encoder;

  return true;
};

OutgoingFrameStream.prototype._queueFrame = function(frame) {
  
  if (this._frame === null) {
    this._frame = frame;
  }
  else {
    this._queue.push(frame);
  }
  
  return frame;
};

OutgoingFrameStream.prototype.frame = function(
  command, headers, streamOptions) {
  
  return this._queueFrame(new Frame(this, command, headers, streamOptions));
};

OutgoingFrameStream.prototype.heartbeat = function() {
  
  if (this._frame) {
    return;
  }
  
  this._destination.write('\n', 'utf8');
};

OutgoingFrameStream.prototype.finish = function() {
  this._destinationFinished = true;
};

OutgoingFrameStream.prototype.hasFinished = function() {
  return this._destinationFinished;
};

function Frame(stream, command, headers, streamOptions) {
  
  Stream.Writable.call(this, streamOptions);
  
  this._stream = stream;
  this._writes = [];
  this._write = this._writeHeaderAndBody;
  
  this.command = command;
  this.headers = headers || {};
}

util.inherits(Frame, Stream.Writable);

Frame.prototype.end = function(chunk, encoding, cb) {
  
  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }
  
  var self = this;
  
  if (chunk !== undefined && chunk !== null) {
    this.write(chunk, encoding, function(error) {
      
      if (error && cb) {
        cb(error);
        return;
      }
      
      self._endFrame(cb);
    });
  }
  else {
    this._endFrame(cb);
  }
};

Frame.prototype._endFrame = function(cb) {
  
  var self = this;
  
  this.write('\x00\n', 'utf-8', function(error) {
    
    if (cb) {
      cb(error);
    }
    
    // Ready to send the next frame
    dequeue(self._stream);
    
    Stream.Writable.prototype.end.apply(self);
  });
};

Frame.prototype._writeHeaderAndBody = function(chunk, encoding, cb) {
  
  this._writeHeader();
  this._writeBody(chunk, encoding, cb);
};

Frame.prototype._writeHeader = function(cb) {
  
  var header = this._stream._encode(this.command) + '\n';
  
  for (var key in this.headers) {
    
    var value = this.headers[key];
    
    if (value !== null && value !== undefined) {
      header += this._stream._encode(key) + ':' +
        this._stream._encode(value) + '\n';
    }
  }
  
  header += '\n';
  
  this._pushWriteRequest(header, 'utf-8', cb);
  
  this._write = this._writeBody;
};

Frame.prototype._writeBody = function(chunk, encoding, cb) {
  
  this._pushWriteRequest(chunk, encoding, cb);
  
  service(this._stream);
};

Frame.prototype._pushWriteRequest = function(chunk, encoding, cb) {
  
  this._writes.push({
    chunk: chunk,
    encoding: encoding,
    cb: cb || function() {}
  });
};

function service(stream) {
  
  if (stream._writing || stream._frame === null || 
      stream._frame._writes.length < 1) return;
  
  if (stream._destinationFinished) {
    var error = new Error('cannot send frame on closed stream');
    stream._frame.emit('error', error);
    dequeue(stream);
    return;
  }
  
  var frame = stream._frame;
  var writeOp = frame._writes.shift();
  
  var chunk = writeOp.chunk;
  var encoding = writeOp.encoding;

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

    for (var i = 0; i < escapeSequences.length; i++) {
      value = value.replace(escapeSequences[i][0], escapeSequences[i][1]);
    }

    return value;
  };
}

function errorOnWrite(chunk, encoding, cb) {
  cb(new Error('cannot write on closed stream'));
}

module.exports = OutgoingFrameStream;
