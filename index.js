/*jslint node: true, indent: 2, unused: true */

module.exports = {
  
  IncomingFrameStream:  require('./lib/IncomingFrameStream'),
  OutgoingFrameStream:  require('./lib/OutgoingFrameStream'),
  
  Client:               require('./lib/Client'),
  
  connect:              require('./lib/connect'),
  ConnectFailover:      require('./lib/ConnectFailover'),
  
  Channel:              require('./lib/Channel'),
  ChannelFactory:       require('./lib/ChannelFactory'),
  ChannelPool:          require('./lib/ChannelPool')
};
