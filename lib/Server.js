/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.Server
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var Socket  = require('./Socket');
var util    = require('util');
var assign  = require('object-assign');

function Server(transportSocket, options) {
  
  var processConnect = forwardEmptyFrame(onConnect);
  
  options = assign({
    commandHandlers:{
      'STOMP': processConnect,
      'CONNECT': processConnect
    },
    unknownCommand: onUnknownCommand
  }, options);
  
  this.softwareId = options.softwareId;
  this.version = '1.1';
  
  this._pendingDisconnect = false;
  
  Socket.call(this, transportSocket, options);
}

util.inherits(Server, Socket);

Server.prototype.readEmptyBody = function(frame, callback) {
  
  var self = this;
  
  frame.readEmptyBody(function(isEmpty) {
    
    if (isEmpty) {
      if (typeof callback === 'function') {
        callback.call(self);
      }
    }
    else {
      
      var error = this.createProtocolError(
        util.format('client sent a non-empty %s frame', frame.command)
      );
      
      self.destroy(error);
    }
  });
};

Server.prototype.sendError = function(message) {
  
  var headers = {};
  
  if (typeof message === 'string') {
    headers.message = message;
  }
  
  var frame = this.sendFrame('ERROR', headers);
  
  var self = this;
  
  frame.once('finish', function() {
    self.destroy(self.createApplicationError(message));
  });
  
  return frame;
};

Server.prototype._beforeSendResponse = function(
  requestFrame, responseFrame, responseEndCallback) {
  
  var receiptId = requestFrame.headers.receipt;
  
  if (receiptId !== undefined) {
    if (responseFrame) {
      responseFrame.headers['receipt-id'] = receiptId;
    }
    else {
      
      responseFrame = this.sendFrame('RECEIPT', {
        'receipt-id': receiptId
      });
      
      responseFrame.end(responseEndCallback);
    }
  }
  else {
    process.nextTick(responseEndCallback);
  }
  
  return responseFrame;
};

Server.prototype._onInputEnd = function() {
  this.destroy();
};

function forwardEmptyFrame(callback) {
  return function(frame, beforeSendResponseCallback) {
    this.readEmptyBody(frame, function() {
      callback.apply(this, [frame, beforeSendResponseCallback]);
    });
  };
}

function onConnect(frame, beforeSendResponse) {
  
  var commands = {
    'DISCONNECT': forwardEmptyFrame(onDisconnect)
  };
  
  if (this._send) {
    commands.SEND = this._send.bind(this);
  }
  
  if (this._subscribe) {
    
    commands.SUBSCRIBE = forwardEmptyFrame(this._subscribe.bind(this));
    commands.UNSUBSCRIBE = forwardEmptyFrame(this._unsubscribe.bind(this));
    
    if (this._ack) {
      commands.ACK = forwardEmptyFrame(this._ack.bind(this));
      commands.NACK = forwardEmptyFrame(this._nack.bind(this));
    }
  }
  
  if (this._begin) {
    commands.BEGIN = forwardEmptyFrame(this._begin.bind(this));
    commands.COMMIT = forwardEmptyFrame(this._commit.bind(this));
    commands.ABORT = forwardEmptyFrame(this._abort.bind(this));
  }
  
  this.setCommandHandlers(commands);
  
  var headers = {
    'version': this.version,
    'heart-beat': this.getHeartbeat().join(',')
  };
  
  if (this.softwareId) {
    headers.server = this.softwareId;
  }
  
  beforeSendResponse(this.sendFrame('CONNECTED', headers)).end();
  
  if (frame.headers['heart-beat'] !== undefined) {
    
    var heartbeat = frame.headers['heart-beat']
      .split(',').map(function(x) {
        return parseInt(x, 10);
      });
    
    if (heartbeat.length > 1 && !isNaN(heartbeat[0]) && !isNaN(heartbeat[1])) {
      this._runHeartbeat(heartbeat[0], heartbeat[1]);
    }
  }
  
  this.headers = frame.headers;
  
  this.emit('connection', this);
}

function onDisconnect(frame, beforeSendResponse) {
  
  this._pendingDisconnect = true;
  
  this.setCommandHandlers({});
  
  this._disconnect.apply(this, [frame, function(frame, responseEndCallback) {
    return beforeSendResponse(frame, function() {
      if (typeof responseEndCallback === 'function') {
        responseEndCallback();
      }
      // Let the client close the connection
    });
  }]);
}

function onUnknownCommand(frame, beforeSendResponse) {
  
  var message = 'unknown command \'' + frame.command + '\'';
  
  beforeSendResponse(this.sendError(message)).end();
}

module.exports = Server;
