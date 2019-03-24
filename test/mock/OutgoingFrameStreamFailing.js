/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const { Writable }  = require('stream');

class OutgoingFrameStream {

  constructor(errMsg) {
    this._errMsg = errMsg;
    this._version = null;
    this._finished = false;
    this._frame = null;
  }

  setVersion(value) {
    this.value = value;
  }

  frame(command, headers, streamOptions) {
    const frame = new Frame(this, command, headers, streamOptions, this._errMsg);
    this._frame = frame;
    return frame;
  }

  finish() {
    this._finished = true;
  }

  hasFinished() {
    return this._finished;
  }

  _write(chunk, encoding, callback) {
    this._body = Buffer.concat([this._body, chunk]);
    callback();
  }
}

class Frame extends Writable {

  constructor(stream, command, headers, streamOptions, errMsg) {

    super(streamOptions);

    this.command = command;
    this.headers = headers;
    this._stream = stream;
    this._errMsg = errMsg;

    this._body = Buffer.alloc(0);

    this._finished = false;

    this.once('finish', () => {
      this._finished = true;
    });
  }

  write() {
    this.emit('error', this._errMsg ? new Error(this._errMsg) : null);
  }

  end(cb) {
    this._endFrame(cb);
  }

  _endFrame(cb) {

    this.write('\x00\n', 'utf-8', (error) => {

      if (cb) {
        cb(error);
      }

      Stream.Writable.prototype.end.apply(this);
    });
  }
}

module.exports = OutgoingFrameStream;
