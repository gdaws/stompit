# stompit [![Build Status](https://travis-ci.org/gdaws/node-stomp.png)](https://travis-ci.org/gdaws/node-stomp)

A STOMP client library for node.js compatible with STOMP 1.0, 1.1 and 1.2 servers.

Stompit is also a command-line application for publishing and consuming messages with a broker.

Library features include
* **Transport agnostism** - the client api supports any transport implementing the Stream.Duplex interface;
* **Frame body streaming** - your application can directly control the reading and writing of frame body content;
* **High-level Channel API** - subscriptions and sending messages are maintained after recovering from connection errors;
* **Low-level Client API** - socket-like interface with manual connection management and error handling.

Example usage of Stompit's Channel API:
```javascript
var stompit = require('stompit');

var connections = new stompit.ConnectFailover([
  {
    host: '172.17.0.2', 
    port: 61613, 
    connectHeaders:{
      host: '/',
      login: 'username',
      passcode: 'password'
    }
  }
]);

var broker = stompit.broker(connections);

broker.send('/queue/a', 'hello', function(error) {
  
  if (error) {
    console.log('send error ' + error.message);
    return;
  }
  
  console.log('message sent');
});

broker.subscribe('/queue/a', function(error, message) {
  
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

Command-line application usage:
```
echo "hello" | stomp-publish "failover:(localhost:61613)" -H "content-type: text/plain" /queue/a
```

```
stomp-consume "failover:(localhost:61613)" /queue/a
```

## Install

 `npm install stompit`

## Documentation

* [API documentation](http://gdaws.github.io/node-stomp/api/)
