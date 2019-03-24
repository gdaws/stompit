/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const { Client } = require('../lib/index');
const Transport = require('./mock/Transport');
const OutgoingFrameStream = require('./mock/OutgoingFrameStream');
const assert = require('assert');

describe('Client.connect', function() {

  var client, transport, framesOut;

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

  it('should parse the heart-beat header and call setHeartbeat', function(done) {

    client.connect({
      'heart-beat': '1,2'
    });

    var heartbeat = client.getHeartbeat();

    assert.equal(heartbeat[0], 1);
    assert.equal(heartbeat[1], 2);

    assert.equal(framesOut._frames[0].headers['heart-beat'], '1,2');

    done();
  });
});
