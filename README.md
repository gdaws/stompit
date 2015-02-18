# stompit [![Build Status](https://travis-ci.org/gdaws/node-stomp.png)](https://travis-ci.org/gdaws/node-stomp)

A STOMP client library for node.js compatible with STOMP 1.0, 1.1 and 1.2 servers.

Features:
* **Transport agnostic** - the client api supports any transport implementing the Stream.Duplex interface;
* **Frame body streaming** - your application is in direct control of reading and writing frame body data;
* **High-level Channel API** - messages being sent and subscriptions are maintained after connection interruptions;
* **Low-level Client API** - socket-like interface with manual connection management and error handling.

Example usage of the Channel API:
```javascript
var stompit = require('stompit');

var connectionManager = new stompit.ConnectFailover([{
  host: '127.0.0.1', 
  port: 61613, 
  connectHeaders:{
    host: '/',
    login: 'username',
    passcode: 'password'
  }
}]);

var channel = new stompit.ChannelFactory(connectionManager);

channel.send('/queue/a', 'hello', function(error) {
  
  if (error) {
    console.log('send error ' + error.message);
    return;
  }
  
  console.log('message sent');
});

channel.subscribe('/queue/a', function(error, message) {
  
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
  });
});
```

## Install

 `npm install stompit`

## Documentation

* [API documentation](http://gdaws.github.io/node-stomp/api/)
