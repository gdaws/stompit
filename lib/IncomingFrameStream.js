/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.IncomingFrameStream
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var stream = require('stream');
var util = require('util');

var MAX_LINE_LENGTH = 1024;
var MAX_HEADERS = 64;

var CR = '\r'.charCodeAt(0);
var LF = '\n'.charCodeAt(0);

function ParseError(message){
  Error.apply(this, arguments);
  this.message = message;
}
util.inherits(ParseError, Error);

function IncomingFrameStream(options) {
  
  if (!options) {
    options = {};
  }
  
  options.objectMode = true;
  options.highWaterMark = 1;
  
  stream.Transform.call(this, options);
  
  this._parse = IncomingFrameStream.prototype._parseCommandLine;
  this._parsingFrame = false;
  this._chunk = null;
  this._paused = false;
  this._transformCallback = null;
  
  this._currentLine = '';
  this._maxLineLength = options.maxLineLength || MAX_LINE_LENGTH;
  this._lineStringEncoding = 'utf-8';
  
  this._command = '';
  this._headers = {};
  this._numHeaders = 0;
  this._maxHeaders = options.maxHeaders || MAX_HEADERS;
  
  this._frameStreamOptions = options.frameStreamOptions || {};
  this._frame = null;
  
  this.setVersion('1.0');
}

util.inherits(IncomingFrameStream, stream.Transform);

IncomingFrameStream.prototype.setVersion = function(versionId) {
  
  var v10Decode = function(value){
    return value;
  };
  
  var v11Decode = createDecodeFunction({
    '\\n': '\n', 
    '\\c': ':', 
    '\\\\': '\\'
  });
  
  var v12Decode = createDecodeFunction({
    '\\r': '\r', 
    '\\n': '\n', 
    '\\c': ':', 
    '\\\\': '\\'
  });
  
  var decoders = {
    '1.0': v10Decode, 
    '1.1': v11Decode, 
    '1.2': v12Decode
  };
  
  var decoder = decoders[versionId];
  
  if (typeof decoder === 'undefined') {
    return false;
  }
  
  this._decode = decoder;
  
  return true;
};

IncomingFrameStream.prototype._transform = function(chunk, encoding, callback) {
  
  if (typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }
  
  this._chunk = chunk;
  this._transformCallback = callback;
  
  this._continueTransform();
};

IncomingFrameStream.prototype._continueTransform = function() {
  
  this._paused = false;
  
  while (!this._paused && this._chunk.length > 0) {
    try {
      this._parse();
    }
    catch(error) {
      if (error instanceof ParseError) {
        this._transformCallback(error);
        return;
      }
      throw error;
    }
  }
  
  if (this._chunk.length === 0 && this._transformCallback && !this._paused) {
    var transformCallback = this._transformCallback;
    this._transformCallback = null;
    transformCallback();
  }
};

IncomingFrameStream.prototype._flush = function(callback) {
  
  if (this._parsingFrame) {
    callback(new ParseError('unexpected end of stream'));
  }
  else {
    if (this._shouldDeferPush()) {
      var self = this;
      setImmediate(function() {
        self.push(null);
        callback();
      });
    }
    else {
      this.push(null);
      callback();
    }
  }
};

IncomingFrameStream.prototype._consume = function(n) {
  this._chunk = this._chunk.slice(n);
};

IncomingFrameStream.prototype._exceededLineLengthLimit = function() {
  
  var limit = this._maxLineLength;
  
  var message = 'maximum line length exceeded (' + limit + ' byte limit)';
  
  throw new ParseError(message);
};

IncomingFrameStream.prototype._pause = function() {
  this._paused = true;
  return this._continueTransform.bind(this);
};

IncomingFrameStream.prototype._parseLine = function() {
  
  var chunk = this._chunk;
  var chunkLength = chunk.length;
  
  var bufferLength = this._currentLine.length;
  var bufferRemaining = this._maxLineLength - bufferLength;
    
  for (var i = 0; i < chunkLength; i++) {
    
    if (chunk[i] === LF) {
      
      if (i + 1 > bufferRemaining) {
        this._exceededLineLengthLimit();
      }
      
      var end = i;
      
      if (i > 0 && chunk[i - 1] === CR) {
        end -= 1;    
      }
      
      var line = this._currentLine + chunk.toString(
        this._lineStringEncoding, 0, end);
      
      this._currentLine = '';
      
      this._consume(i + 1);
      
      return line;
    }
  }
  
  if (chunkLength > bufferRemaining) {
    this._exceededLineLengthLimit();
  }
  
  this._currentLine += chunk.toString(this._lineStringEncoding);
  
  this._consume(chunk.length);
  
  return null;
};

IncomingFrameStream.prototype._parseCommandLine = function() {
  
  this._parsingFrame = true;
  
  var line = this._parseLine();
  
  if (line === null) {
    return;
  }
  
  this._command = this._decode(line);
  this._headers = {};
  this._numHeaders = 0;
  
  this._parse = IncomingFrameStream.prototype._parseHeaderLine;
};

IncomingFrameStream.prototype._parseHeaderLine = function() {
  
  var line = this._parseLine();
  
  if (line === null) {
    return;
  }
  
  if (line.length === 0) {
    return this._beginBody();
  }
  
  var separator = line.indexOf(':');
  
  if (separator === -1) {
    throw new ParseError('header parse error');
  }
  
  var name = this._decode(line.substring(0, separator));
  var value = this._decode(line.substring(separator + 1));
  
  if (!this._headers.hasOwnProperty(name)) {
    
    if (this._numHeaders == this._maxHeaders) {
      throw new ParseError('too many headers');    
    }
    
    this._headers[name] = value;
    this._numHeaders += 1;
  }
};

IncomingFrameStream.prototype._beginBody = function() {
  
  if (this._headers['content-length'] !== void 0) {
    
    var contentLength = parseInt(this._headers['content-length'], 10);
    
    if (isNaN(contentLength)) {
      throw new ParseError('invalid content-length');
    }
    
    this._headers['content-length'] = contentLength;
    
    this._contentLengthRemaining = contentLength;
    
    this._parse = IncomingFrameStream.prototype._parseFixedLengthBody;
  }
  else {
    this._parse = IncomingFrameStream.prototype._parseBody;
  }
  
  this._frame = new IncomingFrame(
    this._command, 
    this._headers, 
    {
      highWaterMark: 0
    }
  );
  
  if (this._shouldDeferPush()) {
    setImmediate(this.push.bind(this, this._frame));
  }
  else{
    this.push(this._frame);
  }
};

IncomingFrameStream.prototype._shouldDeferPush = function() {
  
  // We need to push a new frame stream later from a timeout handler
  // rather than push now if using an old version of node where it warns
  // about high recursive tick depth. A high recursive tick depth could occur
  // where there are many frames to be parsed and read in a single chunk of 
  // input from the socket.
  
  return process.hasOwnProperty('_tickInfoBox');
};

IncomingFrameStream.prototype._parseFixedLengthBody = function() {
  
  var lengthRemaining = this._contentLengthRemaining;
  
  var chunk = this._chunk;
  
  var sliceLength = Math.min(chunk.length, lengthRemaining);
    
  if (!this._frame.push(chunk.slice(0, sliceLength))) {
    this._frame._resume = this._pause();
  }
  
  this._consume(sliceLength);
  
  this._contentLengthRemaining -= sliceLength;
  
  if (this._contentLengthRemaining === 0) {
    this._parse = IncomingFrameStream.prototype._parseNullByte;
  }
};

IncomingFrameStream.prototype._parseBody = function() {
  
  var chunk = this._chunk;
  var chunkLength = chunk.length;
  
  var consumeLength = chunkLength;
  
  var foundNullByte = false;
  
  for (var i = 0; i < chunkLength; i++) {
    if (chunk[i] === 0) {
      consumeLength = i;
      foundNullByte = true;
      break;
    }
  }
  
  if (!this._frame.push(chunk.slice(0, consumeLength))) {
    this._frame._resume = this._pause();
  }
  
  this._consume(consumeLength);
  
  if (foundNullByte) {
    this._consume(1);
    this._beginTrailer();
  }
};

IncomingFrameStream.prototype._parseNullByte = function() {
  
  if (this._chunk[0] !== 0) {
    throw new ParseError('expected null byte');
  }
  
  this._consume(1);
  
  this._beginTrailer();
};

IncomingFrameStream.prototype._beginTrailer = function() {
  
  this._parsingFrame = false;
  
  this._parse = IncomingFrameStream.prototype._parseTrailer;
  
  if (this._frame._resume) {
    
    var frame = this._frame;
    var realResume = this._frame._resume;
    
    this._frame._resume = function() {
      frame.push(null);
      realResume();
    };
  }
  else {
    this._frame.push(null);
  }
};

IncomingFrameStream.prototype._parseTrailer = function() {
  
  var chunk = this._chunk;
  
  var trailerSize = 0;
  
  var chunkLength = chunk.length;
  for (var i = 0; i < chunkLength; i++) {
    
    if (chunk[i] === CR) {
      if (this._currentLine.length === 0) {
        this._currentLine = '\r';
      }
      else {
        throw new ParseError('invalid EOL sequence in trailer');
      }
      
      trailerSize += 1;
    }
    else if (chunk[i] === LF) {
      
      this._currentLine = '';
      
      trailerSize += 1;
    }
    else {
      
      if (this._currentLine.length > 0) {
        throw new ParseError('invalid EOL sequence in trailer');
      }
      
      this._parse = IncomingFrameStream.prototype._parseCommandLine;
      break;
    }
  }
  
  this._consume(trailerSize);
};

function IncomingFrame(command, headers, streamOptions) {
  
  stream.Readable.call(this, streamOptions);
  
  this.command = command;
  this.headers = headers;
}

util.inherits(IncomingFrame, stream.Readable);

IncomingFrame.prototype._read = function() {
  
  if (this._resume) {
    var resume = this._resume;
    delete this._resume;
    resume();
  }
};

IncomingFrame.prototype.readEmptyBody = function(callback) {
  
  callback = callback || function() {};
  
  var self = this;
  
  var onReadable = function() {
    var buffer = self.read();
    if (buffer !== null) {
      callback(false);
      callback = function() {};
    }
  };
  
  this.once('end', function() {
    self.removeListener('readable', onReadable);
    callback(true);
  });
  
  this.on('readable', onReadable);
  
  this.read(0);
};

IncomingFrame.prototype.readString = function(encoding, callback) {
  
  var readable = this;
  
  var buffer = '';
  
  var read = function() {
    var chunk = readable.read();
    if (chunk !== null) {
      buffer += chunk.toString(encoding);
      read();
    }
  };
  
  readable.on('readable', read);
  
  readable.on('end', function() {
    callback(null, buffer);
  });
  
  readable.on('error', callback);
  
  read();
};

function createDecodeFunction(escapeSequences) {
  return function(value) {
    return value.replace(/\\./gi, function(sequence) {
      if (escapeSequences.hasOwnProperty(sequence)) {
        return escapeSequences[sequence];
      }
      else {
        throw new ParseError('undefined escape sequence');
      }
    });
  };
}

module.exports = IncomingFrameStream;
