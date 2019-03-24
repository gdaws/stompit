/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { createReadableStream } = require('../util');

class Transaction {

  constructor(channel) {

    this._channel = channel;
    this._completes = [];
    this._transaction = null;
  }

  send(headers, body) {
    
    this._channel._transmit((error, client, complete) => {
      
      if (error) {
        // Do nothing here and let the user handle an error on commit
        return;
      }
      
      this._completes.push(complete);
      
      const output = this._transaction.send(headers);
      
      createReadableStream(body).pipe(output);
    });
    
    return this;
  }

  abort() {
    
    this._channel._transmit((error, client, complete) => {
      
      if (error) {
        return;
      }
      
      this._transaction.abort();
      
      // We can complete now since none of the messages will have to be re-sent
      
      this._completes.push(complete);
      this._completed();
    });
  }

  commit(callback) {
    
    this._channel._transmit((error, client, complete) => {
      
      if (error) {
        callback(error);
        return;
      }
      
      this._completes.push(complete);
      
      this._transaction.commit({
        onReceipt: () => {
          callback(null);
          this._completed();
        }
      });
    });
  }

  _completed() {
    
    for (let i = 0; i < this._completes.length; i++) {
      this._completes[i]();
    }
    
    this._completes = [];
  }
}

module.exports = Transaction;
