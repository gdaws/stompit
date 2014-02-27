/*jslint node: true, indent: 2, unused: true */

module.exports = {
  
  IncomingFrameStream:  require('./lib/incoming_frame_stream'),
  FrameOutputStream:    require('./lib/frame_output_stream'),

  Client:               require('./lib/client'),
  
  ConnectFailover:      require('./lib/connect_failover'),
  connect:              require('./lib/connect'),
  
  Channel:              require('./lib/channel'),
  ChannelFactory:       require('./lib/channel_factory'),
  broker:               require('./lib/channel_factory')
};
