var stompit = require('stompit');

// Configure connection management

var servers = [
  { 
    host: 'localhost',
    port: 61613,
    connectHeaders:{
      'host': 'localhost',
      'login': 'admin',
      'passcode': 'password',
      'heart-beat': '100,100'
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

// Create channel, subscribe to a queue, and consume one message

var channelFactory = new stompit.ChannelFactory(connections);


channelFactory.channel(function(error, channel) {
  
  if (error) {
    console.log('channel factory error: ' + error.message);
    return;
  }
  
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

      channel.ack(message);
      
      // We only want to consume one message so we unsubscribe now  
      subscription.unsubscribe();
    });
  });
});
