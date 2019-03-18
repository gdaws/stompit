# stompit [![Build Status](https://travis-ci.org/gdaws/node-stomp.png)](https://travis-ci.org/gdaws/node-stomp)

A STOMP client library for Node.js that is fully compatible with STOMP 1.0, 1.1 
and 1.2 servers. The library provides optional fault tolerance features such as 
multiple server failover and persistent subscriptions and message publishing 
across failure events. The API is designed to be consistent with idiomatic 
Node.js code. Messages are stream oriented. The client supports any 
stream.Duplex transport, such as for example tls.TLSSocket.

An example of sending and receiving a message using the client API:
```javascript
const stompit = require('stompit');

const connectOptions = {
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
  
  const sendHeaders = {
    'destination': '/queue/test',
    'content-type': 'text/plain'
  };
  
  const frame = client.send(sendHeaders);
  frame.write('hello');
  frame.end();
  
  const subscribeHeaders = {
    'destination': '/queue/test',
    'ack': 'client-individual'
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
      
      client.ack(message);
      
      client.disconnect();
    });
  });
});

```

## Install

```
npm install --save stompit
```

## Documentation

* [API documentation](http://gdaws.github.io/node-stomp/api/)
