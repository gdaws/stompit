/*
 * stompit.Socket
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var FrameInputStream    = require('./frame_input_stream');
var FrameOutputStream   = require('./frame_output_stream');
var errors              = require('./errors');
var util                = require('util');
var events              = require('events');

function Socket(transportSocket, options){
    
    events.EventEmitter.call(this);
    
    this._commandHandlers = options.commandHandlers;
    this._unknownCommandHandler = options.unknownCommand || function(){
        this.destroy();
    };
    
    this._transportSocket = transportSocket;
    
    this._destroyed = false;
    this._destroy = this.destroy.bind(this);
    
    this._input = new FrameInputStream(transportSocket, {
        TransportError: errors.TransportError,
        ProtocolError: errors.ProtocolError
    });
    
    this._input.setVersion('1.0');
    
    this._output = new FrameOutputStream(transportSocket);
    
    this._heartbeat = options.heartbeat || [0, 0];
    this._heartbeatDelayMargin = options.heartbeatDelayMargin || 100;
    
    var self = this;
    
    this._input.readFrames(function(frame){
        
        var handler = self._commandHandlers[frame.command];
        
        var beforeSendResponseCallback = function(responseFrame, responseEndCallback){
            return self._beforeSendResponse(frame, responseFrame, responseEndCallback || function(){});
        };
        
        if(typeof handler === 'function'){
            handler.apply(self, [frame, beforeSendResponseCallback]);
        }
        else{
            self._unknownCommandHandler.apply(self, [frame, beforeSendResponseCallback]);
        }
    });
    
    this._input.on('error', this.destroy.bind(this));
    
    this._input.on('end', this._onInputEnd.bind(this));
}

util.inherits(Socket, events.EventEmitter);

Socket.prototype._onInputEnd = function(){
    this.emit('end');
    this.destroy();
};

Socket.prototype.destroy = function(exception){
    if(!this._destroyed){
        this._destroyed = true;
        this._transportSocket.destroy(exception);
        if(exception){
            this.emit('error', exception);
        }
    }
};

Socket.prototype.finishOutput = function(){
    this._output.finish();
    this.emit('finish');
};

Socket.prototype.hasFinishedOutput = function(){
    return this._output.hasFinished();
};

Socket.prototype.setVersion = function(version){

    this._input.setVersion(version);
};

Socket.prototype.getTransportSocket = function(){
    return this._transportSocket;
};

Socket.prototype.setCommandHandler = function(command, handler){
    this._commandHandlers[command] = handler;
};

Socket.prototype.setCommandHandlers = function(handlers){
    this._commandHandlers = handlers;
};

Socket.prototype.setUnknownCommandHandler = function(handler){
    this._unknownCommandHandler = handler;
};

Socket.prototype.sendFrame = function(command, headers, streamOptions){
    var frame = this._output.frame(command, headers, streamOptions);
    frame.on('error', this._destroy);
    return frame;
};

Socket.prototype.getHeartbeat = function(){
    return this._heartbeat;
};

Socket.prototype.setHeartbeat = function(heartbeat){
    this._heartbeat = heartbeat;
}

Socket.prototype.runHeartbeat = function(output, input){
    
    output = (output === 0 || this._heartbeat[0] === 0 ? 0 : Math.max(output, this._heartbeat[0]));
    input = (input === 0 || this._heartbeat[1] === 0 ? 0 : Math.max(input, this._heartbeat[1]) + this._heartbeatDelayMargin);
    
    var self = this;
    
    var intervals = [];
    
    var stop = function(){
        for(var i = 0; i < intervals.length; i++){
            clearInterval(intervals[i]);
        }
    };
    
    this.once('error', stop);
    this.once('end', stop);
    
    if(output > 0){
        
        if(this._transportSocket.setNoDelay){
            this._transportSocket.setNoDelay(true);
        }
        
        intervals.push(setInterval(function(){
            self._output.heartbeat();
        }, output));
    }
    
    if(input > 0){
        
        var lastBytesRead = 0;
        
        intervals.push(setInterval(function(){
            
            var bytesRead = self._transportSocket.bytesRead;
            
            if(bytesRead - lastBytesRead === 0){
                self.destroy(new errors.TransportError('connection timed out'));
            }
            
            lastBytesRead = bytesRead;
            
        }, input));
    }
};

Socket.prototype.isTransportError = function(error){
    return error instanceof errors.TransportError;
};

Socket.prototype.isProtocolError = function(error){
    return error instanceof errors.ProtocolError;
};

Socket.prototype.isApplicationError = function(error){
    return error instanceof errors.ApplicationError;
};

Socket.prototype.createTransportError = function(message){
    return new errors.TransportError(message);
};

Socket.prototype.createProtocolError = function(message){
    return new errors.ProtocolError(message);
};

Socket.prototype.createApplicationError = function(message){
    return new errors.ApplicationError(message);
};

module.exports = Socket;
