
var DuplexStream = require('./DuplexStream');
var util = require('util');

function Transport() {
  DuplexStream.apply(this, arguments);
  this._destroyed = false;
}

util.inherits(Transport, DuplexStream);

Transport.prototype.destroy = function() {
  this._destroyed = true;
};

module.exports = Transport;
