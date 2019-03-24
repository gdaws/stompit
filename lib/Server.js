/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const Socket = require('./Socket');

class Server extends Socket {

  constructor(transportSocket, options) {

    const processConnect = forwardEmptyFrame(onConnect);
    
    options = Object.assign({
      commandHandlers:{
        'STOMP': processConnect,
        'CONNECT': processConnect
      },
      unknownCommand: onUnknownCommand
    }, options);
    
    super(transportSocket, options);

    this.softwareId = options.softwareId;
    this.version = '1.1';
    
    this._pendingDisconnect = false;
  }

  readEmptyBody(frame, callback) {
    
    frame.readEmptyBody((isEmpty) => {
      
      if (isEmpty) {
        if (typeof callback === 'function') {
          callback.call(this);
        }
      }
      else {
        
        const error = this.createProtocolError(
          util.format('client sent a non-empty %s frame', frame.command)
        );
        
        this.destroy(error);
      }
    });
  }

  sendError(message) {
    
    const headers = {};
    
    if (typeof message === 'string') {
      headers.message = message;
    }
    
    const frame = this.sendFrame('ERROR', headers);
    
    frame.once('finish', () => {
      this.destroy(this.createApplicationError(message));
    });
    
    return frame;
  }

  _beforeSendResponse(requestFrame, responseFrame, responseEndCallback) {
    
    const receiptId = requestFrame.headers.receipt;
    
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
  }

  _onInputEnd() {
    this.destroy();
  }
}

function forwardEmptyFrame(callback) {
  return function(frame, beforeSendResponseCallback) {
    this.readEmptyBody(frame, function() {
      callback.apply(this, [frame, beforeSendResponseCallback]);
    });
  };
}

function onConnect(frame, beforeSendResponse) {
  
  const commands = {
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
  
  const headers = {
    'version': this.version,
    'heart-beat': this.getHeartbeat().join(',')
  };
  
  if (this.softwareId) {
    headers.server = this.softwareId;
  }
  
  beforeSendResponse(this.sendFrame('CONNECTED', headers)).end();
  
  if (frame.headers['heart-beat'] !== undefined) {
    
    const heartbeat = frame.headers['heart-beat']
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
  
  const message = 'unknown command \'' + frame.command + '\'';
  
  beforeSendResponse(this.sendError(message)).end();
}

module.exports = Server;
