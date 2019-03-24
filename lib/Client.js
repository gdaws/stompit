/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const Socket = require('./Socket');
const Transaction = require('./client/Transaction');
const Subscription = require('./client/Subscription');
const BufferWritable = require('./util/buffer/BufferWritable');

const ERROR_MAX_CONTENT_LENGTH = 4096;

class Client extends Socket {

  constructor(transportSocket, options = {}) {

    options = {
      commandHandlers: {},
      unknownCommand: onUnknownCommand,
      resetDisconnect: true,
      ...options
    };

    super(transportSocket, options);

    this._options = options;

    this._receipts = {};
    this._nextReceiptId = 1;

    this._subscriptions = {};
    this._nextSubcriptionId = 1;

    this._nextTransactionId = 1;

    this._disconnecting = false;
    this._hasDisconnectReceipt = false;

    this._resetDisconnect = options.resetDisconnect === true;
  }

  _onInputEnd() {

    if (this._hasDisconnectReceipt) {
      this.destroy();
    }
    else {

      const errorMessage = this.hasFinishedOutput() ?
        'connection ended without disconnect receipt' :
        'connection ended unexpectedly';

      this.destroy(this.createProtocolError(errorMessage));
    }
  }

  _beforeSendResponse() {
    // No interception of outgoing frame
  }

  _onDestroyed(exception) {

    if (!exception) {
      return;
    }

    for (let key in this._subscriptions) {
      this._subscriptions[key].processMessageFrame(exception);
    }
  }

  /*
   * Create frame to send to the server. This method returns a Writable stream
   * object for sending the frame body content.
   */
  sendFrame(command, headers, options) {

    if (options) {

      let onReceipt = options.onReceipt;

      if (typeof options.onError === 'function') {

        const originalOnReceipt = onReceipt || function(){};

        const onError = options.onError;

        this.on('error', onError);

        onReceipt = () => {
          this.removeListener('error', onError);
          originalOnReceipt();
        };
      }

      if (typeof onReceipt === 'function') {

        const id = this._nextReceiptId++;

        this._receipts[id] = onReceipt;

        headers.receipt = id;
      }
    }

    return Socket.prototype.sendFrame.apply(this, arguments);
  }

  /*
   * Send CONNECT frame to the server.
   */
  connect(headers, callback) {

    if (typeof headers === 'string') {
      headers = {'host': headers};
    }

    headers = Object.assign({
      'accept-version': '1.0,1.1,1.2'
    }, headers);

    let heartbeat = this.getHeartbeat();

    if (typeof headers['heart-beat'] === "string") {
      const match = headers['heart-beat'].match(/^(\d+) *, *(\d+)$/);
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

      const self = this;

      (function() {

        const onConnected = function(client) {
          cleanup();
          callback(null, client);
        };

        const onError = function(error) {
          cleanup();
          callback(error);
        };

        const cleanup = function() {
          self.removeListener('error', onError);
          self.removeListener('connect', onConnected);
        };

        self.on('error', onError);
        self.on('connect', onConnected);

      })();
    }

    const frame = this.sendFrame('CONNECT', headers);

    frame.end();
  }

  /*
   * Send a message to the server. This method returns a Writable stream object 
   * for sending the frame body content.
   */
  send(headers, options) {

    if (typeof headers === 'string') {
      headers = {destination: headers};
    }

    return this.sendFrame('SEND', headers, options);
  }

  /*
   * Send a message with the specified body to the server.
   */
  sendString(headers, body, options, callback) {
    const frame = this.send(headers, options);
    frame.write(body);
    frame.end(callback);
  }

  begin(headers) {

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

    const transaction = new Transaction(headers.transaction, this);

    this.sendFrame('BEGIN', headers).end();

    return transaction;
  }

  subscribe(headers, messageListener) {

    if (typeof headers === 'string') {
      headers = {destination: headers};
    }

    let id = headers.id !== undefined ? 
      headers.id : this._nextSubcriptionId++;

    while (this._subscriptions[id] !== undefined) {
      id = this._nextSubcriptionId++;
    }

    headers.id = id;

    const ack = headers.ack || 'auto';

    ensureValidAckMode(ack);

    const subscription = new Subscription(id, ack, messageListener, this);

    this._subscriptions[id] = subscription;

    this.sendFrame('SUBSCRIBE', headers).end();

    return subscription;
  }

  _getAckHeaders(message, userHeaders) {
    return Object.assign({}, userHeaders, {
      'subscription': message.headers.subscription,
      'message-id': message.headers['message-id'],
      'id': message.headers.ack
    });
  }

  ack(message, headers, sendOptions, callback) {
    const frame = this.sendFrame('ACK',
      this._getAckHeaders(message, headers), sendOptions);
    frameHandler(frame, callback);
  }

  nack (message, headers, sendOptions, callback) {
    const frame = this.sendFrame('NACK',
      this._getAckHeaders(message, headers), sendOptions);
    frameHandler(frame, callback);
  }

  getSubscription(id) {
    return this._subscriptions[id];
  }

  setImplicitSubscription(id, ack, messageListener) {

    if (this._subscriptions.hasOwnProperty(id)) {
      throw new Error('subscription id \'' + id + '\' already in use');
    }

    if (ack === void 0 || ack === null){
      ack = 'auto';
    }

    ensureValidAckMode(ack);

    const subscription = new Subscription(id, ack, messageListener, this);

    this._subscriptions[id] = subscription;

    return subscription;
  }

  /*
   * Perform graceful disconnect from server. This operation does not complete
   * until all messages are acknowledged.
   */
  disconnect(callback) {

    if (typeof callback === 'function') {

      const self = this;

      (function() {

        const onEnd = function(client) {
          cleanup();
          callback(null, client);
        };

        const onError = function(error) {
          cleanup();
          callback(error);
        };

        const cleanup = function() {
          self.removeListener('end', onEnd);
          self.removeListener('error', onError);
        };

        self.on('end', onEnd);
        self.on('error', onError);
      })();
    }

    this.sendFrame('DISCONNECT', {}, {
      onReceipt: () => {

        this._hasDisconnectReceipt = true;

        const transport = this.getTransportSocket();

        if (this._resetDisconnect) {
          this.destroy();
        }
        else{
          transport.end();
        }
      }
    }).end(this._finishOutput.bind(this));

    // Keep the transport output open until the receipt is processed just in 
    // case the transport is not configured to handle half-open connections.

    this._disconnecting = true;
  }

  readEmptyBody(frame, callback) {

    frame.readEmptyBody((isEmpty) => {

      if (isEmpty) {
        if (typeof callback === 'function') {
          callback.call(this);
        }
      }
      else {
        this.destroy(this.createProtocolError('expected empty body frame'));
      }
    });
  }

  /*
   * Get the connection options that the client was initialized with.
   */
  getOptions() {
    return this._options;
  }
}

function ensureValidAckMode(mode) {

  const validAckModes = [
    'auto', 'client', 'client-individual'
  ];

  if (validAckModes.indexOf(mode) === -1) {
    throw new Error('invalid ack mode: \'' + mode + '\'');
  }
}

function frameHandler(frame, callback) {
  const cb = function (err) {
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

  this.readEmptyBody(frame, () => {

    if (frame.headers['heart-beat'] !== undefined) {

      const heartbeat = frame.headers['heart-beat']
        .split(',').map(function(x) {
          return parseInt(x, 10);
        });

      if ( heartbeat.length > 1 &&
           !isNaN(heartbeat[0]) &&
           !isNaN(heartbeat[1]) ) {

        this._runHeartbeat(heartbeat[0], heartbeat[1]);
      }
    }

    this.headers = frame.headers;

    this.emit('connect', this);

    beforeSendResponse();
  });
}

function onError(frame) {

  const message = frame.headers.message ? frame.headers.message :
    'server sent ERROR frame';

  const error = this.createApplicationError(message);

  if ( frame.headers['content-type'] === 'text/plain' &&
      frame.headers['content-length'] <= ERROR_MAX_CONTENT_LENGTH) {

    const content = new BufferWritable(Buffer.alloc(ERROR_MAX_CONTENT_LENGTH));

    frame.on('end', function() {
      error.longMessage = content.getWrittenSlice().toString();
      this.destroy(error);
    });

    frame.pipe(content);
  }
  else {
    this.destroy(error);
  }
}

function onMessage(frame, beforeSendResponse) {

  const subId = frame.headers.subscription;

  const subscription = this._subscriptions[subId];

  if (subscription === void 0) {
    this.destroy(this.createProtocolError('invalid subscription id ' + subId));
    return;
  }

  subscription.processMessageFrame(null, frame);

  beforeSendResponse();
}

function onReceipt(frame, beforeSendResponse) {

  const id = frame.headers['receipt-id'];

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
