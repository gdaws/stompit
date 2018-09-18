/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.Client
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var Socket          = require('./Socket');
var Transaction     = require('./client/Transaction');
var Subscription    = require('./client/Subscription');
var BufferWritable  = require('./util/buffer/BufferWritable');
var util            = require('util');
var assign          = require('object-assign');

var ERROR_MAX_CONTENT_LENGTH = 4096;

// STOMP client connection
function Client(transportSocket, options) {

  this._options = options;

  options = assign({
    commandHandlers: {},
    unknownCommand: onUnknownCommand,
    resetDisconnect: true
  }, options);

  Socket.call(this, transportSocket, options);

  this._receipts = {};
  this._nextReceiptId = 1;

  this._subscriptions = {};
  this._nextSubcriptionId = 1;

  this._nextTransactionId = 1;

  this._disconnecting = false;
  this._hasDisconnectReceipt = false;

  this._resetDisconnect = options.resetDisconnect === true;
}

util.inherits(Client, Socket);

Client.prototype._onInputEnd = function() {
  if (this._hasDisconnectReceipt) {
    this.destroy();
  }
  else {

    var errorMessage = this.hasFinishedOutput() ?
      'connection ended without disconnect receipt' :
      'connection ended unexpectedly';

    this.destroy(this.createProtocolError(errorMessage));
  }
};

Client.prototype._beforeSendResponse = function() {
  // No interception of outgoing frame
};

Client.prototype._onDestroyed = function(exception) {

  if (!exception) {
    return;
  }

  for (var key in this._subscriptions) {
    this._subscriptions[key].processMessageFrame(exception);
  }
};

/*
 * Create frame to send to the server. This method returns a Writable stream
 * object for sending the frame body content.
 */
Client.prototype.sendFrame = function(command, headers, options) {

  if (options) {

    var onReceipt = options.onReceipt;

    if (typeof options.onError === 'function') {

      var originalOnReceipt = onReceipt || function(){};

      var onError = options.onError;

      this.on('error', onError);

      var self = this;
      onReceipt = function() {
        self.removeListener('error', onError);
        originalOnReceipt();
      };
    }

    if (typeof onReceipt === 'function') {

      var id = this._nextReceiptId++;

      this._receipts[id] = onReceipt;

      headers.receipt = id;
    }
  }

  return Socket.prototype.sendFrame.apply(this, arguments);
};

/*
 * Send CONNECT frame to the server.
 */
Client.prototype.connect = function(headers, callback) {

  if (typeof headers === 'string') {
    headers = {'host': headers};
  }

  headers = assign({
    'accept-version': '1.0,1.1,1.2'
  }, headers);

  var heartbeat = this.getHeartbeat();

  if (typeof headers['heart-beat'] === "string") {
    var match = headers['heart-beat'].match(/^(\d+) *, *(\d+)$/);
    if (match) {
      heartbeat = [parseInt(match[1], 10), parseInt(match[2], 10)];
      this.setHeartbeat(heartbeat);
    }
  }

  headers['heart-beat'] = heartbeat[0] + "," + heartbeat[1];

  this.setCommandHandlers({
    'CONNECTED': onConnected,
    'ERROR': onError
  });

  if (typeof callback === 'function') {

    var self = this;

    (function() {

      var onConnected = function(client) {
        cleanup();
        callback(null, client);
      };

      var onError = function(error) {
        cleanup();
        callback(error);
      };

      var cleanup = function() {
        self.removeListener('error', onError);
        self.removeListener('connect', onConnected);
      };

      self.on('error', onError);
      self.on('connect', onConnected);
    })();
  }

  var frame = this.sendFrame('CONNECT', headers);

  frame.end();
};

/*
 * Send a message to the server. This method returns a Writable stream object 
 * for sending the frame body content.
 */
Client.prototype.send = function(headers, options) {

  if (typeof headers === 'string') {
    headers = {destination: headers};
  }

  return this.sendFrame('SEND', headers, options);
};

/*
 * Send a message with the specified body to the server.
 */
Client.prototype.sendString = function(headers, body, options, callback) {
  var frame = this.send(headers, options);
  frame.write(body);
  frame.end(callback);
};

Client.prototype.begin = function(headers) {

  if (typeof headers !== 'object') {
    if (typeof headers !== 'undefined') {
      headers = {transaction: headers};
    }
    else {
      headers = {};
    }
  }

  if (!('transaction' in headers)) {
    headers.transaction = this._nextTransactionId++;
  }

  var transaction = new Transaction(headers.transaction, this);

  this.sendFrame('BEGIN', headers).end();

  return transaction;
};

function ensureValidAckMode(mode) {

  var validAckModes = [
    'auto', 'client', 'client-individual'
  ];

  if (validAckModes.indexOf(mode) === -1) {
    throw new Error('invalid ack mode: \'' + mode + '\'');
  }
}

Client.prototype.subscribe = function(headers, messageListener) {

  if (typeof headers === 'string') {
    headers = {destination: headers};
  }

  var id = headers.id !== undefined ? headers.id : this._nextSubcriptionId++;

  while (this._subscriptions[id] !== undefined) {
    id = this._nextSubcriptionId++;
  }

  headers.id = id;

  var ack = headers.ack || 'auto';

  ensureValidAckMode(ack);

  var subscription = new Subscription(id, ack, messageListener, this);

  this._subscriptions[id] = subscription;

  this.sendFrame('SUBSCRIBE', headers).end();

  return subscription;
};

Client.prototype._getAckHeaders = function(message, userHeaders) {
  return assign({}, userHeaders, {
    'subscription': message.headers.subscription,
    'message-id': message.headers['message-id'],
    'id': message.headers.ack
  });
};

Client.prototype.ack = function(message, headers, sendOptions, callback) {
  var frame = this.sendFrame('ACK',
    this._getAckHeaders(message, headers), sendOptions);
  frameHandler(frame, callback);
};

Client.prototype.nack = function(message, headers, sendOptions, callback) {
  var frame = this.sendFrame('NACK',
    this._getAckHeaders(message, headers), sendOptions);
  frameHandler(frame, callback);
};

Client.prototype.getSubscription = function(id) {
  return this._subscriptions[id];
};

Client.prototype.setImplicitSubscription = function(id, ack, messageListener) {

  if (this._subscriptions.hasOwnProperty(id)) {
    throw new Error('subscription id \'' + id + '\' already in use');
  }

  if (ack === void 0 || ack === null){
    ack = 'auto';
  }

  ensureValidAckMode(ack);

  var subscription = new Subscription(id, ack, messageListener, this);

  this._subscriptions[id] = subscription;

  return subscription;
};

/*
 * Perform graceful disconnect from server. This operation does not complete
 * until all messages are acknowledged.
 */
Client.prototype.disconnect = function(callback) {

  var self = this;

  if (typeof callback === 'function') {
    (function() {

      var onEnd = function(client) {
        cleanup();
        callback(null, client);
      };

      var onError = function(error) {
        cleanup();
        callback(error);
      };

      var cleanup = function() {
        self.removeListener('end', onEnd);
        self.removeListener('error', onError);
      };

      self.on('end', onEnd);
      self.on('error', onError);
    })();
  }

  this.sendFrame('DISCONNECT', {}, {
    onReceipt: function() {

      self._hasDisconnectReceipt = true;

      var transport = self.getTransportSocket();

      if (self._resetDisconnect) {
        this.destroy();
      }
      else{
        transport.end();
      }
    }
  }).end(this._finishOutput.bind(this));

  // Keep the transport output open until the receipt is processed just in case
  // the transport is not configured to handle half-open connections.

  this._disconnecting = true;
};

Client.prototype.readEmptyBody = function(frame, callback) {

  var self = this;

  frame.readEmptyBody(function(isEmpty) {

    if (isEmpty) {
      if (typeof callback === 'function') {
        callback.call(self);
      }
    }
    else {
      self.destroy(self.createProtocolError('expected empty body frame'));
    }
  });
};

/*
 * Get the connection options that the client was initialized with.
 */
Client.prototype.getOptions = function() {
  return this._options;
};

function frameHandler(frame, callback) {
  var cb = function (err) {
    if (typeof callback === 'function') {
      callback(err || new Error('The frame failed but no error was provided'));
    }
  };
  frame.on('error', cb);
  frame.end(function (err) {
    frame.removeListener('error', cb);
    if (typeof callback === 'function') {
      callback(err);
    }
  });
}

function onConnected(frame, beforeSendResponse) {

  // If no version header is present then assume the server is running stomp 1.0
  // protocol
  this.setVersion(frame.headers.version || '1.0');

  this.setCommandHandlers({
    'MESSAGE': onMessage,
    'RECEIPT': onReceipt,
    'ERROR': onError
  });

  var self = this;

  this.readEmptyBody(frame, function() {

    if (frame.headers['heart-beat'] !== undefined) {

      var heartbeat = frame.headers['heart-beat']
        .split(',').map(function(x) {
          return parseInt(x, 10);
        });

      if ( heartbeat.length > 1 &&
           !isNaN(heartbeat[0]) &&
           !isNaN(heartbeat[1]) ) {

        this._runHeartbeat(heartbeat[0], heartbeat[1]);
      }
    }

    self.headers = frame.headers;

    self.emit('connect', self);

    beforeSendResponse();
  });
}

function onError(frame) {

  var message = frame.headers.message ? frame.headers.message :
    'server sent ERROR frame';

  var error = this.createApplicationError(message);

  if ( frame.headers['content-type'] === 'text/plain' &&
      frame.headers['content-length'] <= ERROR_MAX_CONTENT_LENGTH) {

    var content = new BufferWritable(Buffer.alloc(ERROR_MAX_CONTENT_LENGTH));

    var self = this;

    frame.on('end', function() {
      error.longMessage = content.getWrittenSlice().toString();
      self.destroy(error);
    });

    frame.pipe(content);
  }
  else {
    this.destroy(error);
  }
}

function onMessage(frame, beforeSendResponse) {

  var subId = frame.headers.subscription;

  var subscription = this._subscriptions[subId];

  if (subscription === void 0) {
    this.destroy(this.createProtocolError('invalid subscription id ' + subId));
    return;
  }

  subscription.processMessageFrame(null, frame);

  beforeSendResponse();
}

function onReceipt(frame, beforeSendResponse) {

  var id = frame.headers['receipt-id'];

  if (id === undefined || this._receipts[id] === undefined) {
    this.destroy(this.createProtocolError('invalid receipt'));
    return;
  }

  this.readEmptyBody(frame, function() {
    this._receipts[id].call(this);
    delete this._receipts[id];
    beforeSendResponse();
  });
}

function onUnknownCommand(frame) {
  this.destroy(this.createProtocolError(
    'unknown command \'' + frame.command + '\''
  ));
}

module.exports = Client;
