
var Client = require('../index').Client;
var Transport = require('./mock/Transport');
var OutgoingFrameStream = require('./mock/OutgoingFrameStream');
var assert = require('assert');

describe('Client.connect', function() {

  var client, transport, framesOut, framesIn;

  beforeEach(function() {

    transport = new Transport();
    framesOut = new OutgoingFrameStream();

    client = new Client(transport, {
      outgoingFrameStream: framesOut
    });
  });

  it('should send a CONNECT frame and include accept-version header', function(done) {

    client.connect();

    assert(framesOut._frames[0]);

    var frame = framesOut._frames[0];

    assert.equal(frame.command, 'CONNECT');
    assert('accept-version' in frame.headers);

    assert.equal(frame._finished, true);
    assert.equal(frame._body.length, 0);
    
    done();
  });

});
