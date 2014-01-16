/*jslint node: true, indent: 2, unused: true */

'use strict';

var Messaging = require("./lib/messaging");

module.exports = {

  IncomingFrameStream: require("./lib/incoming_frame_stream"),
  FrameOutputStream: require("./lib/frame_output_stream"),

  Client: require("./lib/client"),

  Failover: require("./lib/failover"),
  Messaging: Messaging,

  connect: require("./lib/connect"),

  broker: function () {
    var messaging = Object.create(Messaging.prototype);
    Messaging.apply(messaging, arguments);
    return messaging;
  }
};
