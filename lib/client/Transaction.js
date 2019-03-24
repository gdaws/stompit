/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

class Transaction {

  constructor(id, client) {

    this._client = client;
    this.id = id;
  }

  send() {
    const frame = this._client.send.apply(this._client, arguments);
    frame.headers.transaction = this.id;
    return frame;
  }

  abort(options) {
    
    this._client.sendFrame('ABORT', {
      transaction: this.id
    }, options).end();
  }

  commit(options) {
    
    this._client.sendFrame('COMMIT', {
      transaction: this.id
    }, options).end();
  }

}

module.exports = Transaction;
