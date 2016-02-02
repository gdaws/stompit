
var Client = require('../index').Client;
var Transport = require('./mock/Transport');
var OutgoingFrameStream = require('./mock/OutgoingFrameStream');
var assert = require('assert');

describe('Client.ack', function() {

  var client, transport, framesOut, framesIn;

  beforeEach(function() {

    transport = new Transport();
    framesOut = new OutgoingFrameStream();

    client = new Client(transport, {
      outgoingFrameStream: framesOut
    });
  });

  it('should send an ACK frame', function(done) {

    client.ack({
      headers: {
        'subscription': '0',
        'message-id': '001',
        'ack': '002'
      }
    });

    assert(framesOut._frames[0]);

    var frame = framesOut._frames[0];

    assert.equal(frame.command, 'ACK');

    assert.equal(frame.headers['message-id'], '001');
    assert.equal(frame.headers.id, '002');
    assert.equal(frame.headers.subscription, '0');

    assert(frame._finished);

    done();
  });
});

describe('Client.nack', function() {

  var client, transport, framesOut, framesIn;

  beforeEach(function() {

    transport = new Transport();
    framesOut = new OutgoingFrameStream();

    client = new Client(transport, {
      outgoingFrameStream: framesOut
    });
  });

  it('should send an ACK frame', function(done) {

    client.nack({
      headers: {
        'subscription': '0',
        'message-id': '001',
        'ack': '002'
      }
    });

    assert(framesOut._frames[0]);

    var frame = framesOut._frames[0];

    assert.equal(frame.command, 'NACK');

    assert.equal(frame.headers['message-id'], '001');
    assert.equal(frame.headers.id, '002');
    assert.equal(frame.headers.subscription, '0');

    assert(frame._finished);

    done();
  });
});
