
module.exports = MemorySocket;

var BufferReadWritable = require("./buffer_readwritable");
var util = require("util");
var stream = require("stream");

function MemorySocket(bufferSize, options){
    
    options = options || {};
    
    options.allowHalfOpen = true;
    
    stream.Duplex.call(this, options);
    
    bufferSize = bufferSize || 0x4000;
    
    var readWritableOptions = {
        highWaterMark: 0
    };
    
    this._input = new BufferReadWritable(new Buffer(bufferSize),readWritableOptions);
    this._output = new BufferReadWritable(new Buffer(bufferSize), readWritableOptions);
    
    this._open = true;
    
    this._peer = new PeerSocket(this, options);
    
    this.bytesRead = 0;
    this.bytesWritten = 0;
}

util.inherits(MemorySocket, stream.Duplex);

MemorySocket.prototype._read = function(){
    
    var readable = this._input;
    
    if(!this._open){
        return;
    }
    
    var chunk = readable.read();
    
    if(chunk !== null){
        
        this.bytesRead += chunk.length;
        
        this.push(chunk);
    }
    else{
        readable.once("readable", MemorySocket.prototype._read.bind(this));
    }
};

MemorySocket.prototype._write = function(chunk, encoding, callback){
    
    if(!this._open){
        callback(new Error("socket is not open"));
        return;
    }
    
    this.bytesWritten += chunk.length;
    
    this._output.write(chunk, encoding, callback);
};

MemorySocket.prototype.end = function(chunk, encoding, callback){
    
    if(typeof chunk === 'function'){
        callback = chunk;
        chunk = null;
        encoding = null;
    } else if(typeof encoding === 'function'){
        callback = encoding;
        encoding = null;
    }
    
    if(chunk !== undefined && chunk !== null){
        this.write(chunk, encoding);
    }
    
    var self = this;
    
    this._output.end(function(){
        self._peer.push(null);
        stream.Writable.prototype.end.apply(self);
    });
};

MemorySocket.prototype.getPeerSocket = function(){
    return this._peer;
};

MemorySocket.prototype.destroy = function(exception){
    
    if(!this._open){
        return;
    }
    
    this._open = false;
    this.readable = false;
    this.writable = false;
    
    this._peer._open = false;
    this._peer.readable = false;
    this._peer.writable = false;
    
    var self = this;
    
    process.nextTick(function(){
        
        var isError = exception ? true : false;
        
        self.emit("close", isError);
        self._peer.emit("close", isError);
        
        if(isError){
            self.emit("error", exception);
            self._peer.emit("error", exception);
        }
    });
    
    this._output.end();
};

function PeerSocket(memorySocket, options){
    
    options = options;
    
    stream.Duplex.call(this, options);
    
    this._peer = memorySocket;
    
    this._input = this._peer._output;
    this._output = this._peer._input;
    
    this._open = true;
    
    this.bytesRead = 0;
    this.bytesWritten = 0;
}

util.inherits(PeerSocket, MemorySocket);
