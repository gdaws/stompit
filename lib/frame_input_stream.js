/*
 * stompit.FrameInputStream
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var events  = require('events');
var stream  = require('stream');
var util    = require('./util');
var errors  = require('./errors');

var MAX_LINE_LENGTH = 4096;
var CR = '\r'.charCodeAt(0);
var LF = '\n'.charCodeAt(0);

function FrameInputStream(source, options){
    
    events.EventEmitter.call(this);
    
    this.TransportError = (options && options.TransportError) || errors.TransportError || Error;
    this.ProtocolError = (options && options.ProtocolError) || errors.ProtocolError || Error;
    
    if(!this.setVersion('1.1')){
        throw new Error('Could not set to version 1.1 mode');
    }
    
    this._source = source;
    
    this._frameQueue = [];
    
    var self = this;
    
    // Using nextTick fixes a bug where the stream was set to reading state 
    // but the net stream implementor stopped reading. This bus was caused 
    // by ignoring recursive readable events triggered by unshifts.
    var parseFrameOnNextTick = process.nextTick.bind(null, this._parseFrame.bind(this));
    source.on('readable', parseFrameOnNextTick);
    
    var error = processError.bind(this);
    
    var isEnded = false;
    var end = function(){
        if(!isEnded){
            isEnded = true;
            emptyFrameQueue.apply(self);
            self.emit('end');
        }
    };
    
    source.on('close', function(hadError){
        if(!hadError){
            end();
        }
    });
    
    source.on('end', function(){
        if(self._frame && self._frame.readingFrame){
            error(new self.ProtocolError('read frame error'));
        }
        else{
            end();
        }
    });
    
    source.once('error', function(exception){
        var wrapperException = new self.TransportError(exception.message);
        util.extend(wrapperException, exception);
        error(wrapperException);
    });
}

util.inherits(FrameInputStream, events.EventEmitter);

FrameInputStream.prototype.setVersion = function(version){
    
    var funcs = supportedVersions[version];
    
    if(funcs === undefined){
        return false;
    }
    
    this._version = version;
    this._versionTraits = funcs;
    
    this._incomingFrameConstructor = function(){
        IncomingFrame.apply(this, arguments);
    };
    
    util.inherits(this._incomingFrameConstructor, IncomingFrame);
    
    this._incomingFrameConstructor.prototype._decode = funcs.decode;
    
    return true;
};

FrameInputStream.prototype.decodeHeaderValue = function(value){
    return version_11.decode(value);
};

FrameInputStream.prototype.getSource = function(){
    return this._source;
};

FrameInputStream.prototype.readFrame = function(callback){
    
    var IncomingFrameClass = this._incomingFrameConstructor;
    
    var frame = new IncomingFrameClass(this, callback);
    
    frame.on('error', function(){});
    
    if(this._frame === undefined){
        this._frame = frame;
        this._parseFrame();
    }
    else{
        this._frameQueue.push(frame);
    }
};

FrameInputStream.prototype._parseFrame = function(){
    
    try{
        while(this._frame && this._frame._parse.call(this._frame, this._source));
    }
    catch(exception){
        
        if(exception instanceof ParseError){
            processError.call(this, exception);
        }
        else{
            throw exception;
        }
    }
};

function emptyFrameQueue(){
    
    var error = new Error('stream has ended');
    
    if(this._frame){
        
        this._frame._invokeCallback(error);
        
        if(this._frame.readingFrame){
            this._frame.emit('error', error);
        }
        
        delete this._frame;
    }
    
    var frameQueue = this._frameQueue;
    var frameQueueLen = frameQueue.length;
    
    for(var i = 0; i < frameQueueLen; i++){
        frameQueue[i]._invokeCallback(error);
        frameQueue[i].emit('error', error);
    }
    
    this._frameQueue = [];
}

function processError(exception){
    emptyFrameQueue.apply(this);
    this.emit('error', exception);
}

function ParseError(message){
    this.message = message;
}

ParseError.prototype = Error.prototype;

function IncomingFrame(frameInputStream, callback){
    
    stream.Readable.call(this);
    
    this._frameInputStream = frameInputStream;
    
    this._callback = callback;
    
    this.readingFrame = false;
    
    this._lineStash = '';
    
    this._pushable = true;
    
    this._parse = readCommandLine;
    
    this.headers = {};
}

util.inherits(IncomingFrame, stream.Readable);

IncomingFrame.prototype._read = function(){
    if(this._frameInputStream._frame){
        this._frameInputStream._frame._pushable = true;
        this._frameInputStream._parseFrame();
    }
};

IncomingFrame.prototype._readLine = function(source){
    
    var stashLength = this._lineStash.length;
    
    var data;
    
    while((data = source.read()) !== null){
        
        var dataLength = data.length;
        
        for(var i = 0; i < dataLength; i++){
            
            if(stashLength + i + 1 > MAX_LINE_LENGTH){
                throw new ParseError('maximum line length exceeded (' + MAX_LINE_LENGTH + ' character limit)');
            }
            
            if(data[i] === LF){
                
                var end = i;
                
                if(i > 0 && data[i - 1] === CR){
                    end = i - 1;
                }
                
                var line = this._lineStash + data.toString('utf-8', 0, end);
                
                this._lineStash = '';
                
                source.unshift(data.slice(i + 1));
                
                return line;
            }
        }
        
        this._lineStash += data.toString('utf-8');
    }
    
    return null;
};

IncomingFrame.prototype.readEmptyBody = function(callback){
    
    callback = callback || function(){};
    
    var self = this;
    
    var onReadable = function(){
        var buffer = self.read();
        if(buffer !== null){
            callback(false);
            callback = function(){};
        }
    };
    
    this.once('end', function(){
        self.removeListener('readable', onReadable);
        callback(true);
    });
    
    this.once('readable', onReadable);
    
    this.read(0);
};


IncomingFrame.prototype._invokeCallback = function(error){
    
    var self = this;
    
    process.nextTick(function(){
        if(self._callback){
            self._callback(error, self);
            delete self._callback;
        }
    });
};

function readCommandLine(source){
    
    var line = this._readLine(source);
    
    if(line !== null && line.length > 0){
        
        this.readingFrame = true;
        
        this.command = this._decode(line);
        
        this._parse = readHeaderFieldLine;
        
        return true;
    }
    
    return false;
}

function readHeaderFieldLine(source){
    
    var line = this._readLine(source);
    
    if(line !== null){
        
        if(line.length > 0){
            
            var separator = line.indexOf(':');
            
            if(separator === -1){
                throw new ParseError('header parse error');
            }
            
            var header = line.split(':');
            
            var name = this._decode(line.substring(0, separator));
            var value = this._decode(line.substring(separator + 1));
            
            if(!this.headers.hasOwnProperty(name)){
                this.headers[name] = value;
            }
            
            return true;
        }
        else{
            
            if(this.headers['content-length'] !== undefined){
                
                var contentLength = parseInt(this.headers['content-length'], 10);
                
                if(isNaN(contentLength)){
                    throw new ParseError('invalid content-length');
                }
                
                this.headers['content-length'] = contentLength;
                
                this._contentLengthRemaining = contentLength;
                
                this._parse = readFixedLengthBody;
            }
            else{
                this._parse = readBody;
            }
            
            this._invokeCallback(null);
            
            // Return false to let the frame user control the reading of the body
        }
    }
    
    return false;
}

function readBody(source){
    
    var chunk;
    
    while(this._pushable && (chunk = source.read()) !== null){
        
        var terminated = null;
        
        var chunkLength = chunk.length;
        for(var i = 0; i < chunkLength; i++){
            if(chunk[i] === 0){
                terminated = i;
                break;
            }
        }
        
        if(terminated === null){
            this._pushable = this.push(chunk);
        }
        else{
            
            this._parse = readTrailer;
            
            source.unshift(chunk.slice(terminated + 1));
            
            // Update parse state before pushing in case of recursive read
            this.push(chunk.slice(0, terminated));
            this.push(null);
            
            return true;
        }
    }
    
    return false;
}

function readFixedLengthBody(source){
    
    var chunk;
    
    while(this._pushable && (chunk = source.read()) !== null){
        
        var lengthRemaining = this._contentLengthRemaining;
        
        if(chunk.length < lengthRemaining){
            
            this._contentLengthRemaining -= chunk.length;
            
            this._pushable = this.push(chunk);
        }
        else{
            
            this._parse = readNullByte;
            
            source.unshift(chunk.slice(lengthRemaining));
            
            // Update parse state before pushing in case of recursive read
            this.push(chunk.slice(0, lengthRemaining));
            
            return true;
        }
    }
    
    return false;
}

function readNullByte(source){
    
    var nullByte = source.read(1);
    
    if(nullByte === null){
        return false;
    }
    
    if(nullByte[0] !== 0){
        throw new ParseError('expected null byte');
    }
    
    this._parse = readTrailer;
    
    this.push(null);
    
    return true;
}

function readTrailer(source){
    
    // The peer can drop the connection now without triggering an error
    this.readingFrame = false;
    
    var chunk;
    
    while((chunk = source.read(1)) !== null){
        
        if(chunk[0] == CR){
            this._lineStash = '\r';
            continue;
        }
        
        if(this._lineStash.length > 0 && chunk[0] !== LF){
            throw new ParseError('invalid EOL sequence');
        }
        
        this._lineStash = '';
        
        // If not LF then it's the first character of the next frame
        if(chunk[0] !== LF){
            source.unshift(chunk);
            this._frameInputStream._frame = this._frameInputStream._frameQueue.shift();
            return true;
        }
    }
    
    return false;
}

function createDecodeFunction(escapeSequences){
    return function(value){
        return value.replace(/\\./gi, function(sequence){
            if(escapeSequences.hasOwnProperty(sequence)){
                return escapeSequences[sequence];
            }
            else{
                throw new ParseError('undefined escape sequence');
            }
        });
    };
}

var version_10 = {
    decode: function(value){return value;}
};

var version_11 = {
    decode: createDecodeFunction({'\\n': '\n', '\\c': ':', '\\\\': '\\'})
};

var version_12 = {
    decode: createDecodeFunction({'\\r': '\r', '\\n': '\n', '\\c': ':', '\\\\': '\\'})
};

var supportedVersions = {
    '1.0': version_10,
    '1.1': version_11,
    '1.2': version_12
};

module.exports = FrameInputStream;
