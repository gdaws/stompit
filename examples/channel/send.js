var stompit = require('stompit');

// Configure connection management

var servers = [
  { 
    host: '172.17.0.2',
    port: 61613,
    timeout: 3000,
    connectHeaders:{
      host: 'mybroker'
    }
  }
];

var reconnectOptions = {
  maxReconnectAttempts: 1,
  maxAttempts: 1
};

var connections = new stompit.ConnectFailover(servers, reconnectOptions);

// Log connection events

connections.on('connecting', function(connector) {
  
  var address = connector.remoteAddress.transportPath;
  
  console.log('Connecting to ' + address);
});

connections.on('error', function(error) {
  
  var address = error.connector.remoteAddress.transportPath;
  
  console.log('Connection error to ' + address + ': ' + error.message);
});

// Create channel and send message

var channel = new stompit.ChannelFactory(connections);

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
