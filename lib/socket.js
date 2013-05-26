
module.exports = Socket;

var FrameInputStream = require("./frame_input_stream");
var FrameOutputStream = require("./frame_output_stream");
var util = require("util");
var events = require("events");

function Socket(transportSocket, options){
    
    events.EventEmitter.call(this);
    
    this._commandHandlers = options.commandHandlers;
    this._unknownCommandHandler = options.unknownCommand || function(){
        this.destroy();
    };
    
    this._transportSocket = transportSocket;
    this._input = new FrameInputStream(transportSocket);
    this._output = new FrameOutputStream(transportSocket);
    
    this._heartbeat = options.heartbeat || [0, 0];
    this._heartbeatDelayMargin = options.heartbeatDelayMargin || 100;
    
    var self = this;
    
    this._input.readFrames(function(frame){
        
        var handler = self._commandHandlers[frame.command];
        
        var beforeSendResponseCallback = function(responseFrame, responseEndCallback){
            return self._beforeSendResponse(frame, responseFrame, responseEndCallback || function(){});
        };
        
        if(typeof handler === "function"){
            handler.apply(self, [frame, beforeSendResponseCallback]);
        }
        else{
            self._unknownCommandHandler.apply(self, [frame, beforeSendResponseCallback]);
        }
    });
    
    this._input.on("error", this.destroy.bind(this));
    
    this._transportSocket.on("end", function(){
       self.emit("end");
    });
}

util.inherits(Socket, events.EventEmitter);

Socket.prototype.destroy = function(exception){
    
    this._transportSocket.destroy();
    
    this.emit("error", exception);
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
    return this._output.frame(command, headers, streamOptions);
};

Socket.prototype.getHeartbeat = function(){
    return this._heartbeat;
};

Socket.prototype.setHeartbeat = function(output, input){
    
    output = (output === 0 || this._heartbeat[0] === 0 ? 0 : Math.max(output, this._heartbeat[0]));
    input = (input === 0 || this._heartbeat[1] === 0 ? 0 : Math.max(input, this._heartbeat[1]) + this._heartbeatDelayMargin);
    
    var self = this;
    
    var intervals = [];
    
    var stop = function(){
        for(var i = 0; i < intervals.length; i++){
            clearInterval(intervals[i]);
        }
    };
    
    this.once("error", stop);
    this.once("end", stop);
    
    if(output > 0){
        
        var lastBytesWritten = 0;
        
        intervals.push(setInterval(function(){
            
            var bytesWritten = self._transportSocket.bytesWritten;
            
            if(bytesWritten - lastBytesWritten === 0){
                self._output.heartbeat();
            }
            
            lastBytesWritten = bytesWritten;
            
        }, output));
    }
    
    if(input > 0){
        
        var lastBytesRead = 0;
        
        intervals.push(setInterval(function(){
            
            var bytesRead = self._transportSocket.bytesRead;
            
            if(bytesRead - lastBytesRead === 0){
                self.destroy(new Error("connection timed out"));
            }
            
            lastBytesRead = bytesRead;
            
        }, input));
    }
};
