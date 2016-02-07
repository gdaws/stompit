var stompit = require('stompit');

var connectionManager = new stompit.ConnectFailover([
  {
    host: 'localhost', 
    port: 61613,
    resetDisconnect: false,
    connectHeaders:{
      'accept-version': '1.0',
      host: 'localhost',
      login: 'admin',
      passcode: 'password',
      'heart-beat': '1000,1000'
    }
  }
]);

connectionManager.on('error', function(error) {
  var connectArgs = error.connectArgs;
  var address = connectArgs.host + ':' + connectArgs.port;
  console.log('Could not connect to ' + address + ': ' + error.message);
});

connectionManager.on('connecting', function(connector) {
  console.log('Connecting to ' + connector.serverProperties.remoteAddress.transportPath);
});

var channelPool = stompit.ChannelPool(connectionManager);

channelPool.channel(function(error, channel) {
  
  if (error) {
    console.log('send-channel error: ' + error.message);
    return;
  }
  
  var sendHeaders = {
    destination: '/queue/a'
  };
  
  channel.send(sendHeaders, 'hello', function(error) {
    
    if (error) {
      console.log('send error ' + error.message);
      return;
    }
    
    console.log('message sent');
  });
});

channelPool.channel(function(error, channel) {
  
  if (error) {
    console.log('subscribe-channel error: ' + error.message);
    return;
  }
  
  var subscribeHeaders = {
    destination: '/queue/a'
  };
  
  channel.subscribe(subscribeHeaders, function(error, message, subscription) {
    
    if (error) {
      console.log('subscribe error: ' + error.message);
      return;
    }
    
    message.readString('utf8', function(error, body) {
      
      if (error) {
        console.log('read message error ' + error.message);
        return;
      }

      console.log('received message: ' + body);
      
      subscription.unsubscribe();
    });
  });
});
