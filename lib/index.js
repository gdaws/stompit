/*jslint node: true, indent: 2, unused: true */

module.exports = {
  
  IncomingFrameStream:  require('./IncomingFrameStream'),
  OutgoingFrameStream:  require('./OutgoingFrameStream'),
  
  Client:               require('./Client'),
  
  connect:              require('./connect'),
  ConnectFailover:      require('./ConnectFailover'),
  
  Channel:              require('./Channel'),
  ChannelFactory:       require('./ChannelFactory'),
  ChannelPool:          require('./ChannelPool')
};
