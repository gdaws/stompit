/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const { Duplex } = require('stream');

class DuplexStream extends Duplex {

  constructor(...args) {
    super(...args);
    this._written = Buffer.alloc(0);
  }

  _read() {

  }

  _write(chunk, encoding, callback) {
    this._body = Buffer.concat([this._body, chunk]);
    callback();
  }
}

module.exports = DuplexStream;
