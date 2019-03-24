/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const DuplexStream = require('./DuplexStream');

class Transport extends DuplexStream {

  constructor(...args) {
    super(...args);
    this._destroyed = false;
  }

  destroy() {
    this._destroyed = true;
  }
}

module.exports = Transport;
