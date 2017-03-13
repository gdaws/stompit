/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.Socket
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var OutgoingFrameStream = require('./OutgoingFrameStream');
var IncomingFrameStream = require('./IncomingFrameStream');
var util                = require('util');
var assign              = require('object-assign');
var events              = require('events');

function Socket(transportSocket, options) {
  
  var self = this;
  
  events.EventEmitter.call(this);
  
  this._commandHandlers = options.commandHandlers;
  this._unknownCommandHandler = options.unknownCommand || function() {
    this.destroy();
  };
  
  this._destroyed = false;
  this._destroy = this.destroy.bind(this);
  
  this._transportSocket = transportSocket;
  this._transportFinished = false;
  
  transportSocket.on('finish', function() {
    self._transportFinished = true;
  });
  
  transportSocket.on('error', function(error) {
    
    var code = error.code || error.errno;
    if( code === 'ECONNRESET' && self.hasFinishedOutput()) {
      
      // Some servers may choose to send RST instead of FIN to prevent
      // connection lingering (per v1.2 recommendation)
      
      self._onInputEnd();
      
      return;
    }
    
    self.destroy(self.createTransportError(error));
  });
  
  var incoming = new IncomingFrameStream(options);
  
  this._incoming = incoming;
  transportSocket.pipe(incoming);
  
  this._readingFrame = false;

  this._output = options.outgoingFrameStream || 
    new OutgoingFrameStream(transportSocket);
  
  this._heartbeat = options.heartbeat || [0, 0];
  this._heartbeatDelayMargin = options.heartbeatDelayMargin || 100;
  this._heartbeatOutputMargin = options.heartbeatOutputMargin || 0;
  
  var readFrameBody = function(frame, callback) {
    
    frame.on('end', callback);
    
    var handler = self._commandHandlers[frame.command];
    
    var beforeSendResponseCallback = function(
      responseFrame, responseEndCallback) {
      
      return self._beforeSendResponse(frame, responseFrame, 
        responseEndCallback || function() {});
    };
    
    if (typeof handler === 'function') {
      handler.apply(self, [frame, beforeSendResponseCallback]);
    }
    else {
      self._unknownCommandHandler.apply(
        self, [frame, beforeSendResponseCallback]
      );
    }
  };
  
  var readIncomingFrame = function() {
    
    if (self._readingFrame) {
      return;
    }
    
    var frame = incoming.read();
    
    if (!frame) {
      return;
    }
    
    self._readingFrame = true;
    
    readFrameBody(frame, function onFrameEnd(error) {
      
      self._readingFrame = false;
      
      if (!error) {
        process.nextTick(readIncomingFrame);
      }
    });
  };
  
  incoming.on('readable', readIncomingFrame);
  
  incoming.on('error', function onError(error) {
    self.destroy(self.createProtocolError(error));
  });
  
  incoming.on('end', function onEnd() {
    self._onInputEnd();
  });
  
  readIncomingFrame();
}

util.inherits(Socket, events.EventEmitter);

Socket.prototype._onInputEnd = function() {
  this.destroy();
};

Socket.prototype.destroy = function(exception) {
  if (!this._destroyed) {
    this._destroyed = true;
    this._transportSocket.destroy(exception);
    if (exception) {
      this.emit('error', exception);
    }
    else{
      this.emit('end');
    }
    
    if (typeof this._onDestroyed === 'function') {
      this._onDestroyed(exception);
    }
  }
};

Socket.prototype._finishOutput = function() {
  if (!this.hasFinishedOutput()) {
    this._output.finish();
    this.emit('finish');
  }
};

Socket.prototype.hasFinishedOutput = function() {
  return this._output.hasFinished();
};

Socket.prototype.setVersion = function(version) {
  this._incoming.setVersion(version);
  this._output.setVersion(version);
};

Socket.prototype.getTransportSocket = function() {
  return this._transportSocket;
};

Socket.prototype.setCommandHandler = function(command, handler) {
  this._commandHandlers[command] = handler;
};

Socket.prototype.setCommandHandlers = function(handlers) {
  this._commandHandlers = handlers;
};

Socket.prototype.setUnknownCommandHandler = function(handler) {
  this._unknownCommandHandler = handler;
};

Socket.prototype.sendFrame = function(command, headers, streamOptions) {
  var frame = this._output.frame(command, headers, streamOptions);
  frame.on('error', this._destroy);
  return frame;
};

Socket.prototype.getHeartbeat = function() {
  return this._heartbeat;
};

Socket.prototype.setHeartbeat = function(heartbeat) {
  this._heartbeat = heartbeat;
};

Socket.prototype._runHeartbeat = function(input, output) {
  
  output = output === 0 || this._heartbeat[0] === 0 ? 
    0 : Math.max(output, this._heartbeat[0]) - this._heartbeatOutputMargin;
  
  input = input === 0 || this._heartbeat[1] === 0 ? 
    0 : Math.max(input, this._heartbeat[1]) + this._heartbeatDelayMargin;
  
  var self = this;
  
  var intervals = [];
  
  var stop = function() {
    for (var i = 0; i < intervals.length; i++) {
      clearInterval(intervals[i]);
    }
  };
  
  var transportSocket = this._transportSocket;
  
  transportSocket.once('error', stop);
  transportSocket.once('end', stop);
  transportSocket.once('close', stop);
  
  if (output > 0) {
    
    if (this._transportSocket.setNoDelay) {
      this._transportSocket.setNoDelay(true);
    }
    
    intervals.push(setInterval(function() {
      self._output.heartbeat();
    }, output));
  }
  
  if (input > 0) {
    
    var lastBytesRead = 0;
    
    intervals.push(setInterval(function() {
      
      var bytesRead = self._transportSocket.bytesRead;
      
      if (bytesRead - lastBytesRead === 0) {
        self.destroy(self.createTransportError('connection timed out'));
      }
      
      lastBytesRead = bytesRead;
      
    }, input));
  }
};

var returnFalse = function() {
  return false;
};

var returnTrue = function() {
  return true;
};

Socket.prototype._createError = function(error, extensions) {
  
  if (!(error instanceof Error)) {
    error = new Error(error);
  }
  
  assign(error, assign({
  
    isTransportError: returnFalse,
    isProtocolError: returnFalse,
    isApplicationError: returnFalse
  
  }, extensions));
  
  return error;
};

Socket.prototype.createTransportError = function(message) {
  
  var error = this._createError(message, {
    isTransportError: returnTrue
  });
  
  return error;
};

Socket.prototype.createProtocolError = function(message) {
  
  var error = this._createError(message, {
    isProtocolError: returnTrue
  });
  
  return error;
};

Socket.prototype.createApplicationError = function(message) {
  
  var error = this._createError(message, {
    isApplicationError: returnTrue
  });
  
  return error;
};

module.exports = Socket;
