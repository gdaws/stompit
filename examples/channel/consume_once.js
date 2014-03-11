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

// Create channel, subscribe to a queue, and consume one message

var channel = new stompit.ChannelFactory(connections);

var headers = {
  'destination': '/queue/test',
  'ack': 'client-individual'
};

channel.subscribe(headers, function(error, message, subscription){
  
  if (error) {
    console.log('subscribe error: ' + error.message);
    return;
  }
  
  message.readString('utf8', function(error, string) {
        
    if (error) {
      console.log('read message error: ' + error.message);
      return;
    }
    
    console.log('receive message: ' + string);
    
    message.ack();
    
    // We only want to consume one message so we unsubscribe now  
    subscription.unsubscribe();
  });
  
});
