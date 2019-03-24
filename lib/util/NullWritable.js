/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { Writable } = require('stream');
const { createHash } = require('crypto');

class NullWritable extends Writable {

  constructor(hashAlgorithm) {
    
    super();

    this.bytesWritten = 0;
    this._hash = createHash(hashAlgorithm || 'md5');
  }

  _write(chunk, encoding, callback) {
    this.bytesWritten += chunk.length;
    this._hash.update(chunk);
    callback();
  }

  getBytesWritten() {
    return this.bytesWritten;  
  }

  getHashDigest(encoding) {
    return this._hash.digest(encoding);  
  }
}

module.exports = NullWritable;
