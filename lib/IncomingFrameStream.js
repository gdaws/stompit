/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { Readable, Transform } = require('stream');
const { StringDecoder } = require('string_decoder');

const MAX_LINE_LENGTH = 1024;
const MAX_HEADERS = 64;

const CR = '\r'.charCodeAt(0);
const LF = '\n'.charCodeAt(0);

class ParseError extends Error {
  constructor(message) {
    super(message);
  }
}

class IncomingFrameStream extends Transform {

  constructor(options = {}) {

    options.objectMode = true;
    options.highWaterMark = 1;
    
    super(options);

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

  setVersion(versionId) {
    
    const v10Decode = function(value){
      return value;
    };
    
    const v11Decode = createDecodeFunction({
      '\\n': '\n', 
      '\\c': ':', 
      '\\\\': '\\'
    });
    
    const v12Decode = createDecodeFunction({
      '\\r': '\r', 
      '\\n': '\n', 
      '\\c': ':', 
      '\\\\': '\\'
    });
    
    const decoders = {
      '1.0': v10Decode, 
      '1.1': v11Decode, 
      '1.2': v12Decode
    };
    
    const decoder = decoders[versionId];
    
    if (typeof decoder === 'undefined') {
      return false;
    }
    
    this._decode = decoder;
    
    return true;
  }

  _transform(chunk, encoding, callback) {
    
    if (typeof chunk === 'string') {
      chunk = Buffer.from(chunk, encoding);
    }
    
    this._chunk = chunk;
    this._transformCallback = callback;
    
    this._continueTransform();
  }

  _continueTransform() {
    
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
      const transformCallback = this._transformCallback;
      this._transformCallback = null;
      transformCallback();
    }
  }

  _flush(callback) {
    
    if (this._parsingFrame) {
      callback(new ParseError('unexpected end of stream'));
    }
    else {
      if (this._shouldDeferPush()) {
        setImmediate(() => {
          this.push(null);
          callback();
        });
      }
      else {
        this.push(null);
        callback();
      }
    }
  }

  _consume(n) {
    this._chunk = this._chunk.slice(n);
  }

  _exceededLineLengthLimit() {
    
    const limit = this._maxLineLength;
    
    const message = 'maximum line length exceeded (' + limit + ' byte limit)';
    
    throw new ParseError(message);
  }

  _pause() {
    this._paused = true;
    return this._continueTransform.bind(this);
  }

  _parseLine() {
    
    const chunk = this._chunk;
    const chunkLength = chunk.length;
    
    const bufferLength = this._currentLine.length;
    const bufferRemaining = this._maxLineLength - bufferLength;
      
    for (let i = 0; i < chunkLength; i++) {
      
      if (chunk[i] === LF) {
        
        if (i + 1 > bufferRemaining) {
          this._exceededLineLengthLimit();
        }
        
        let end = i;
        
        if (i > 0 && chunk[i - 1] === CR) {
          end -= 1;    
        }
        
        const line = this._currentLine + chunk.toString(
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
  }

  _parseCommandLine() {
    
    this._parsingFrame = true;
    
    const line = this._parseLine();
    
    if (line === null) {
      return;
    }
    
    this._command = this._decode(line);
    this._headers = {};
    this._numHeaders = 0;
    
    this._parse = IncomingFrameStream.prototype._parseHeaderLine;
  }

  _parseHeaderLine() {
    
    const line = this._parseLine();
    
    if (line === null) {
      return;
    }
    
    if (line.length === 0) {
      return this._beginBody();
    }
    
    const separator = line.indexOf(':');
    
    if (separator === -1) {
      throw new ParseError('header parse error');
    }
    
    const name = this._decode(line.substring(0, separator));
    const value = this._decode(line.substring(separator + 1));
    
    if (!this._headers.hasOwnProperty(name)) {
      
      if (this._numHeaders == this._maxHeaders) {
        throw new ParseError('too many headers');    
      }
      
      this._headers[name] = value;
      this._numHeaders += 1;
    }
  }

  _beginBody() {
    
    if (this._headers['content-length'] !== void 0) {
      
      const contentLength = parseInt(this._headers['content-length'], 10);
      
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
  }

  _shouldDeferPush() {
    
    // We need to push a new frame stream later from a timeout handler
    // rather than push now if using an old version of node where it warns
    // about high recursive tick depth. A high recursive tick depth could occur
    // where there are many frames to be parsed and read in a single chunk of 
    // input from the socket.
    
    return process.hasOwnProperty('_tickInfoBox');
  }

  _parseFixedLengthBody() {
    
    const lengthRemaining = this._contentLengthRemaining;
    
    const chunk = this._chunk;
    
    const sliceLength = Math.min(chunk.length, lengthRemaining);
      
    if (!this._frame.push(chunk.slice(0, sliceLength))) {
      this._frame._resume = this._pause();
    }
    
    this._consume(sliceLength);
    
    this._contentLengthRemaining -= sliceLength;
    
    if (this._contentLengthRemaining === 0) {
      this._parse = IncomingFrameStream.prototype._parseNullByte;
    }
  }

  _parseBody() {
    
    const chunk = this._chunk;
    const chunkLength = chunk.length;
    
    let consumeLength = chunkLength;
    
    let foundNullByte = false;
    
    for (let i = 0; i < chunkLength; i++) {
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
  }

  _parseNullByte() {
    
    if (this._chunk[0] !== 0) {
      throw new ParseError('expected null byte');
    }
    
    this._consume(1);
    
    this._beginTrailer();
  }

  _beginTrailer() {
    
    this._parsingFrame = false;
    
    this._parse = IncomingFrameStream.prototype._parseTrailer;
    
    if (this._frame._resume) {
      
      const frame = this._frame;
      const realResume = this._frame._resume;
      
      this._frame._resume = function() {
        frame.push(null);
        realResume();
      };
    }
    else {
      this._frame.push(null);
    }
  }

  _parseTrailer() {
    
    const chunk = this._chunk;
    
    let trailerSize = 0;
    
    const chunkLength = chunk.length;
    for (let i = 0; i < chunkLength; i++) {
      
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
  }
}

class IncomingFrame extends Readable {

  constructor(command, headers, streamOptions) {

    super(streamOptions);

    this.command = command;
    this.headers = headers;
  }

  _read() {
    
    if (this._resume) {
      const resume = this._resume;
      delete this._resume;
      resume();
    }
  }

  readEmptyBody(callback) {
    
    callback = callback || function() {};
    
    const onReadable = () => {
      const buffer = this.read();
      if (buffer !== null) {
        callback(false);
        callback = function() {};
      }
    };
    
    this.once('end', () => {
      this.removeListener('readable', onReadable);
      callback(true);
    });
    
    this.on('readable', onReadable);
    
    this.read(0);
  }

  readString(encoding, callback) {
    
    const readable = this;
    
    const decoder = new StringDecoder(encoding);
    let buffer = '';
    
    const read = function() {
      const chunk = readable.read();
      if (chunk !== null) {
        buffer += decoder.write(chunk);
        read();
      }
    };
    
    readable.on('readable', read);
    
    readable.on('end', function() {
      buffer += decoder.end();
      callback(null, buffer);
    });
    
    readable.on('error', callback);
    
    read();
  }
}

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
