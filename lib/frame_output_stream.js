
module.exports = FrameOutputStream;

var util = require("util");
var Stream = require("stream");

function FrameOutputStream(destination){
    
    this._destination = destination;
    this._destination_finished = false;
    
    this._writing = false;
    
    var finish = this.finish.bind(this);
    
    destination.on("error", finish);
    destination.on("close", finish);
    destination.on("finish", finish);
    
    destination.on("drain", service.bind(null, this));
    
    this._frame = null;
    this._queue = [];
}

FrameOutputStream.prototype._queueFrame = function(frame){
    
    if(this._frame === null){
        this._frame = frame;
    }
    else{
        this._queue.push(frame);
    }
    
    return frame;
};

FrameOutputStream.prototype.frame = function(command, headers, streamOptions){
    return this._queueFrame(new OutgoingFrame(this, command, headers, streamOptions));
};

FrameOutputStream.prototype.heartbeat = function(callback){
    
    if(this._frame){
        return;
    }
    
    this._destination.write("\n", "utf8", callback);
};

FrameOutputStream.prototype.finish = function(){
    this._destination_finished = true;
};

FrameOutputStream.prototype.hasFinished = function(){
    return this._destination_finished;
};

function OutgoingFrame(stream, command, headers, streamOptions){
    
    Stream.Writable.call(this, streamOptions);
    
    this._stream = stream;
    this._writes = [];
    this._write = this._writeHeaderAndBody;
    
    this.command = command;
    this.headers = headers || {};
}

util.inherits(OutgoingFrame, Stream.Writable);

OutgoingFrame.prototype.end = function(chunk, encoding, callback){
    
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
    
    // Write trailing NULL byte to end this frame
    this.write("\x00", "utf-8", function(error){
        
        if(callback){
            callback(error);
        }
        
        // Ready to send the next frame
        dequeue(self._stream);
        
        Stream.Writable.prototype.end.apply(self);
    });
};

OutgoingFrame.prototype._writeHeaderAndBody = function(chunk, encoding, callback){
    this._writeHeader();
    this._writeBody(chunk, encoding, callback);
};

OutgoingFrame.prototype._writeHeader = function(callback){
    
    var header = encode(this.command) + "\n";
    
    for(var key in this.headers){
        
        var value = this.headers[key];
        
        if(value !== null && value !== undefined){
            header += encode(key) + ":" + encode(value) + "\n";
        }
    }
    
    header += "\n";
    
    this._pushWriteRequest(header, "utf-8", callback);
    
    this._write = this._writeBody;
};

OutgoingFrame.prototype._writeBody = function(chunk, encoding, callback){
    
    this._pushWriteRequest(chunk, encoding, callback);
    
    service(this._stream);
};

OutgoingFrame.prototype._pushWriteRequest = function(chunk, encoding, callback){
    
    this._writes.push({
        chunk: chunk,
        encoding: encoding,
        callback: callback || function(){}
    });
};

function service(stream){
    
    if(stream._writing || stream._frame === null || stream._frame._writes.length < 1){
        return;
    }
    
    if(stream._destination_finished){
        var error = new Error("cannot send frame on closed stream");
        stream._frame.emit("error", error);
        dequeue(stream);
        return;
    }
    
    var frame = stream._frame;
    var writeOp = frame._writes.shift();
    
    stream._writing = stream._destination.write(writeOp.chunk, writeOp.encoding, function(error){
        
        stream._writing = false;
        
        if(error && frame.emit){
            frame.emit("error", error);
        }
        
        writeOp.callback(error);
        
        // The write callback may have called dequeue
        
        if(!error){
            // Attempt next write operation
            service(stream);
        }
        else{
            // Send errors to subsequent write callbacks and let the next
            // frame attempt to write and cause an error
            dequeue(stream);
        }
        
    }) === false;
}

function dequeue(stream){
    
    if(stream._queue.length > 0){
        stream._frame = stream._queue.shift();
    }
    else{
        stream._frame = null;
    }
    
    service(stream);
}

function encode(value){
    
    value = "" + value;
    
    value = value.replace("\\", "\\\\");
    value = value.replace("\n", "\\n");
    value = value.replace(":", "\\c");
    
    return value;
}
