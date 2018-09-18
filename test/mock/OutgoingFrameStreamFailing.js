var util    = require('util');
var Stream  = require('stream');

function OutgoingFrameStream(errMsg) {
  this._errMsg = errMsg;
  this._version = null;
  this._finished = false;
  this._frame = null;
}

OutgoingFrameStream.prototype.setVersion = function(value) {
  this.value = value;
};

OutgoingFrameStream.prototype.frame = function(command, headers, streamOptions) {
  var frame = new Frame(this, command, headers, streamOptions, this._errMsg);
  this._frame = frame;
  return frame;
};

OutgoingFrameStream.prototype.finish = function() {
  this._finished = true;
};

OutgoingFrameStream.prototype.hasFinished = function() {
  return this._finished;
};

function Frame(stream, command, headers, streamOptions, errMsg) {

  Stream.Writable.call(this, streamOptions);

  this.command = command;
  this.headers = headers;
  this._stream = stream;
  this._errMsg = errMsg;

  this._body = Buffer.alloc(0);

  this._finished = false;

  var self = this;

  this.once('finish', function() {
    self._finished = true;
  });
}

util.inherits(Frame, Stream.Writable);

Frame.prototype._write = function() {
  this.emit('error', this._errMsg ? new Error(this._errMsg) : null);
};

Frame.prototype.end = function(cb) {
  this._endFrame(cb);
};

Frame.prototype._endFrame = function(cb) {
  var self = this;

  this.write('\x00\n', 'utf-8', function(error) {

    if (cb) {
      cb(error);
    }

    Stream.Writable.prototype.end.apply(self);
  });
};

OutgoingFrameStream.prototype._write = function(chunk, encoding, callback) {
  this._body = Buffer.concat([this._body, chunk]);
  callback();
};

module.exports = OutgoingFrameStream;
