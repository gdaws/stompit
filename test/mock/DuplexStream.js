
var util    = require('util');
var Stream  = require('stream');

function DuplexStream() {
  Stream.Duplex.apply(this, arguments);
  this._written = Buffer.alloc(0);
}

util.inherits(DuplexStream, Stream.Duplex);

DuplexStream.prototype._read = function() {

};

DuplexStream.prototype._write = function(chunk, encoding, callback) {
  this._body = Buffer.concat([this._body, chunk]);
  callback();
};

module.exports = DuplexStream;
