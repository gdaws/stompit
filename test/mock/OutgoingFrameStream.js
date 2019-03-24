/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const { Writable } = require('stream');

class OutgoingFrameStream {

  constructor() {

    this._version = null;
    this._finished = false;
    this._frames = [];
  }

  setVersion(value) {
    this.value = value;
  }

  frame(command, headers, streamOptions) {
    const frame = new Frame(command, headers, streamOptions);
    this._frames.push(frame);
    return frame;
  }

  finish() {
    this._finished = true;
  }

  hasFinished() {
    return this._finished;
  }
}

class Frame extends Writable {

  constructor(command, headers, streamOptions) {

    super(streamOptions);

    this.command = command;
    this.headers = headers;

    this._body = Buffer.alloc(0);

    this._finished = false;

    this.once('finish', () => {
      this._finished = true;
    });
  }

  _write(chunk, encoding, callback) {
    this._body = Buffer.concat([this._body, chunk]);
    callback();
  }
}

module.exports = OutgoingFrameStream;
