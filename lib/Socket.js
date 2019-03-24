/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const OutgoingFrameStream = require('./OutgoingFrameStream');
const IncomingFrameStream = require('./IncomingFrameStream');
const { EventEmitter } = require('events');

class Socket extends EventEmitter {

  constructor(transportSocket, options) {

    super();

    this._commandHandlers = options.commandHandlers;
    this._unknownCommandHandler = options.unknownCommand || function() {
      this.destroy();
    };
    
    this._destroyed = false;
    this._destroy = this.destroy.bind(this);
    
    this._transportSocket = transportSocket;
    this._transportFinished = false;
    
    transportSocket.on('finish', () => {
      this._transportFinished = true;
    });
    
    transportSocket.on('error', (error) => {
      
      const code = error.code || error.errno;
      if( code === 'ECONNRESET' && this.hasFinishedOutput()) {
        
        // Some servers may choose to send RST instead of FIN to prevent
        // connection lingering (per v1.2 recommendation)
        
        this._onInputEnd();
        
        return;
      }
      
      this.destroy(this.createTransportError(error));
    });
    
    const incoming = new IncomingFrameStream(options);
    
    this._incoming = incoming;
    transportSocket.pipe(incoming);
    
    this._readingFrame = false;

    this._output = options.outgoingFrameStream || 
      new OutgoingFrameStream(transportSocket);
    
    this._heartbeat = options.heartbeat || [0, 0];
    this._heartbeatDelayMargin = options.heartbeatDelayMargin || 100;
    this._heartbeatOutputMargin = options.heartbeatOutputMargin || 0;
    
    const readFrameBody = (frame, callback) => {
      
      frame.on('end', callback);
      
      const handler = this._commandHandlers[frame.command];
      
      const beforeSendResponseCb = (responseFrame, responseEndCallback) => {
        
        return this._beforeSendResponse(frame, responseFrame, 
          responseEndCallback || function() {});
      };
      
      if (typeof handler === 'function') {
        handler.apply(this, [frame, beforeSendResponseCb]);
      }
      else {
        this._unknownCommandHandler.apply(
          this, [frame, beforeSendResponseCb]
        );
      }
    };
    
    const readIncomingFrame = () => {
      
      if (this._readingFrame) {
        return;
      }
      
      const frame = incoming.read();
      
      if (!frame) {
        return;
      }
      
      this._readingFrame = true;
      
      readFrameBody(frame, (error) => {
        
        this._readingFrame = false;
        
        if (!error) {
          process.nextTick(readIncomingFrame);
        }
      });
    };
    
    incoming.on('readable', readIncomingFrame);
    
    incoming.on('error', (error) => {
      this.destroy(this.createProtocolError(error));
    });
    
    incoming.on('end', () => {
      this._onInputEnd();
    });
    
    readIncomingFrame();
  }

  _onInputEnd() {
    this.destroy();
  }

  destroy(exception) {
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
  }

  _finishOutput() {
    if (!this.hasFinishedOutput()) {
      this._output.finish();
      this.emit('finish');
    }
  }

  hasFinishedOutput() {
    return this._output.hasFinished();
  }

  setVersion(version) {
    this._incoming.setVersion(version);
    this._output.setVersion(version);
  }

  getTransportSocket() {
    return this._transportSocket;
  }

  setCommandHandler(command, handler) {
    this._commandHandlers[command] = handler;
  }

  setCommandHandlers(handlers) {
    this._commandHandlers = handlers;
  }

  setUnknownCommandHandler(handler) {
    this._unknownCommandHandler = handler;
  }

  sendFrame(command, headers, streamOptions) {
    const frame = this._output.frame(command, headers, streamOptions);
    frame.on('error', this._destroy);
    return frame;
  }

  getHeartbeat() {
    return this._heartbeat;
  }

  setHeartbeat(heartbeat) {
    this._heartbeat = heartbeat;
  }

  _runHeartbeat(input, output) {
    
    output = output === 0 || this._heartbeat[0] === 0 ? 
      0 : Math.max(output, this._heartbeat[0]) - this._heartbeatOutputMargin;
    
    input = input === 0 || this._heartbeat[1] === 0 ? 
      0 : Math.max(input, this._heartbeat[1]) + this._heartbeatDelayMargin;
    
    const self = this;
    
    const intervals = [];
    
    const stop = function() {
      for (let i = 0; i < intervals.length; i++) {
        clearInterval(intervals[i]);
      }
    };
    
    const transportSocket = this._transportSocket;
    
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
      
      let lastBytesRead = 0;
      
      intervals.push(setInterval(function() {
        
        const bytesRead = self._transportSocket.bytesRead;
        
        if (bytesRead - lastBytesRead === 0) {
          self.destroy(self.createTransportError('connection timed out'));
        }
        
        lastBytesRead = bytesRead;
        
      }, input));
    }
  }

  _createError(error, extensions) {
    
    if (!(error instanceof Error)) {
      error = new Error(error);
    }
    
    Object.assign(error, Object.assign({
    
      isTransportError: () => false,
      isProtocolError: () => false,
      isApplicationError: () => false
    
    }, extensions));
    
    return error;
  }

  createTransportError(message) {
    
    const error = this._createError(message, {
      isTransportError: () => true
    });
    
    return error;
  }

  createProtocolError(message) {
    
    const error = this._createError(message, {
      isProtocolError: () => true
    });
    
    return error;
  }

  createApplicationError(message) {
    
    const error = this._createError(message, {
      isApplicationError: () => true
    });
    
    return error;
  }
}

module.exports = Socket;
