/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const { Client } = require('../lib/index');
const Transport = require('./mock/Transport');
const OutgoingFrameStream = require('./mock/OutgoingFrameStream');
const OutgoingFrameStreamFailing = require('./mock/OutgoingFrameStreamFailing');
const assert = require('assert');

describe('Client.ack', function() {

  var client, transport, framesOut;

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

  it('should call the callback', function(done) {
    client.ack({
      headers: {
        'subscription': '0',
        'message-id': '001',
        'ack': '002'
      }
    }, undefined, undefined, function() {
      assert.ok(true);
      done();
    });
  });

  it('should call the callback with an error', function(done) {
    var errMsg = 'My Error Message';
    var clientToFail = new Client(transport, {
      outgoingFrameStream: new OutgoingFrameStreamFailing(errMsg)
    });
    clientToFail.ack({
      headers: {
        'subscription': '0',
        'message-id': '001',
        'ack': '002'
      }
    }, undefined, {
      onError: function (err) {
        assert.equal(err.message, errMsg);
      }
    }, function(err) {
      assert.equal(err.message, errMsg);
      done();
    });
  });

  it('should call the callback with an undefined error', function(done) {
    var clientToFail = new Client(transport, {
      outgoingFrameStream: new OutgoingFrameStreamFailing()
    });
    clientToFail.ack({
      headers: {
        'subscription': '0',
        'message-id': '001',
        'ack': '002'
      }
    }, undefined, {
      onError: function (err) {
        assert.equal(err.message, 'The frame failed but no error was provided');
      }
    }, function(err) {
      assert.equal(err.message, 'The frame failed but no error was provided');
      done();
    });
  });
});

describe('Client.nack', function() {

  var client, transport, framesOut;

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

  it('should call the callback', function(done) {
    client.nack({
      headers: {
        'subscription': '0',
        'message-id': '001',
        'ack': '002'
      }
    }, undefined, undefined, function() {
      assert.ok(true);
      done();
    });
  });
});
