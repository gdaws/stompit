var stompit = require('stompit');

// Configure connection management

var servers = [
  { 
    host: 'localhost',
    port: 61613,
    connectHeaders:{
      host: 'localhost',
      login: 'admin',
      passcode: 'password'
    }
  }
];

var reconnectOptions = {
  maxReconnects: 1
};

var connections = new stompit.ConnectFailover(servers, reconnectOptions);

// Log connection events

connections.on('connecting', function(connector) {
  
  var address = connector.serverProperties.remoteAddress.transportPath;
  
  console.log('Connecting to ' + address);
});

connections.on('error', function(error) {
  
  var connectArgs = error.connectArgs;
  var address = connectArgs.host + ':' + connectArgs.port;
  
  console.log('Connection error to ' + address + ': ' + error.message);
});

// Create channel and send message

var channelFactory = new stompit.ChannelFactory(connections);

channelFactory.channel(function(error, channel) {
  
  if (error) {
    console.log('channel factory error: ' + error.message);
    return;
  }
  
  var headers = {
    'destination': '/queue/test',
    'content-type': 'text/plain',
    'content-length': 5
  };
  
  var body = 'hello';

  channel.send(headers, body, function(error){
    
    if (error) {
      console.log('send error: ' + error.message);
      return;
    }
    
    console.log('sent message');
  });
});
