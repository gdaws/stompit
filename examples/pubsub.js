var stompit = require('stompit');

var connections = new stompit.ConnectFailover([
  {
    host: '172.17.0.2', 
    port: 61613, 
    connectHeaders:{
      host: 'mybroker'
    }
  }
]);

connections.on('error', function(error) {
    console.log('Could not connect to ' + error.connector.remoteAddress.transportPath + ': ' + error.message);
});

connections.on('connecting', function(connector) {
  console.log('Connecting to ' + connector.remoteAddress.transportPath);
});

var channel = stompit.ChannelPool(connections);

channel.send({destination:'/queue/a'}, 'hello', function(error) {

  if (error) {
    console.log('send error ' + error.message);
    return;
  }

  console.log('message sent');
});

channel.subscribe('/queue/a', function(error, message, subscription) {

  if (error) {
    console.log('subscribe error ' + error.message);
    return;
  }

  message.readString('utf8', function(error, body) {

    if (error) {
      console.log('read message error ' + error.message);
      return;
    }

    console.log('received message: ' + body);
    
    message.ack();
    
    subscription.unsubscribe();
  });
});
