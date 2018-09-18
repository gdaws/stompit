var util    = require('util');
var Stream  = require('stream');

function OutgoingFrameStream() {
  this._version = null;
  this._finished = false;
  this._frames = [];
}

OutgoingFrameStream.prototype.setVersion = function(value) {
  this.value = value;
};

OutgoingFrameStream.prototype.frame = function(command, headers, streamOptions) {
  var frame = new Frame(command, headers, streamOptions);
  this._frames.push(frame);
  return frame;
};

OutgoingFrameStream.prototype.finish = function() {
  this._finished = true;
};

OutgoingFrameStream.prototype.hasFinished = function() {
  return this._finished;
};

function Frame(command, headers, streamOptions) {

  Stream.Writable.call(this, streamOptions);

  this.command = command;
  this.headers = headers;

  this._body = Buffer.alloc(0);

  this._finished = false;

  var self = this;

  this.once('finish', function() {
    self._finished = true;
  });
}

util.inherits(Frame, Stream.Writable);

OutgoingFrameStream.prototype._write = function(chunk, encoding, callback) {
  this._body = Buffer.concat([this._body, chunk]);
  callback();
};

module.exports = OutgoingFrameStream;
