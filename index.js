/*jslint node: true, indent: 2, unused: true */

module.exports = {
  
  IncomingFrameStream:  require('./lib/incoming_frame_stream'),
  OutgoingFrameStream:  require('./lib/outgoing_frame_stream'),
  
  Client:               require('./lib/client'),
  
  connect:              require('./lib/connect'),
  ConnectFailover:      require('./lib/connect_failover'),
  
  Channel:              require('./lib/channel'),
  ChannelFactory:       require('./lib/channel_factory'),
  ChannelPool:          require('./lib/channel_pool'),
  broker:               require('./lib/channel_pool')
};
