# stompit [![Build Status](https://travis-ci.org/gdaws/node-stomp.png)](https://travis-ci.org/gdaws/node-stomp)

A STOMP client library for node.js compatible with STOMP 1.0, 1.1 and 1.2 servers.

Features:
* **Transport agnostic** - the client api supports any transport implementing the Stream.Duplex interface;
* **Frame body streaming** - your application is in direct control of reading and writing frame body data;
* **Low-level Client API** - socket-like interface with manual connection management and error handling.
* **High-level Channel API** - messages being sent and subscriptions are maintained after connection interruptions;

An example of sending and receiving a message using the client API:
```javascript
var stompit = require('stompit');

var connectOptions = {
  'host': 'localhost',
  'port': 61613,
  'connectHeaders':{
    'host': '/',
    'login': 'username',
    'passcode': 'password',
    'heart-beat': '5000,5000'
  }
};

stompit.connect(connectOptions, function(error, client) {
  
  if (error) {
    console.log('connect error ' + error.message);
    return;
  }
  
  var sendHeaders = {
    'destination': '/queue/test',
    'content-type': 'text/plain'
  };
  
  var frame = client.send(sendHeaders);
  frame.write('hello');
  frame.end();
  
  var subscribeHeaders = {
    'destination': '/queue/test',
    'ack': 'auto'
  };
  
  client.subscribe(subscribeHeaders, function(error, message) {
    
    if (error) {
      console.log('subscribe error ' + error.message);
      return;
    }
    
    message.readString('utf-8', function(error, body) {
      
      if (error) {
        console.log('read message error ' + error.message);
        return;
      }
      
      console.log('received message: ' + body);
      
      message.ack();
      
      client.disconnect();
    });
  });
});

```

## Install

 `npm install stompit`

## Documentation

* [API documentation](http://gdaws.github.io/node-stomp/api/)
