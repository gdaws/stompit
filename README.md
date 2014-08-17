# stompit [![Build Status](https://travis-ci.org/gdaws/node-stomp.png)](https://travis-ci.org/gdaws/node-stomp)

A STOMP client library for node.js compatible with STOMP 1.0, 1.1 and 1.2 servers.

Stompit is also a command-line application for publishing and consuming messages 
with a broker.

Library features include:
* **Transport agnostic** - the client api supports any transport implementing the Stream.Duplex interface;
* **Frame body streaming** - your application is in direct control of reading and writing frame body data;
* **High-level Channel API** - messages being sent and subscriptions are maintained after connection interruptions;
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

var channel = new stompit.ChannelFactory(connections);

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

## Stompit API

* stompit.connect(options, [connectionListener])

## Client

* new stompit.Client(transport, [options])
* client.connect(headers, [callback])
* client.disconnect([callback])
* client.destroy([error])
* client.send(headers, [options])
* client.sendFrame(command, headers, [options])

### Subscription

* client.subscribe(headers, onMessageCallback) → Subscription
* subscription.unsubscribe()
* onMessageCallback(error, message)
  * message inherits stream.Readable
  * message.readString(encoding, callback)
  * message.ack()
  * message.nack()

### Transaction

* client.begin([headers])
  * transaction.send(headers, [options])
  * transaction.commit([options])
  * transaction.abort([options])

## Connection Failover

* new stompit.ConnectFailover(servers, [options])
* failover.connect(connectCallback)
* connectCallback(error, reconnect)

## Channel
* new stompit.Channel(connectFailover, [options])
* channel.send(headers, body, [callback])
* channel.subscribe(headers, onMessageCallback)
* channel.begin([headers]) → Transaction
  * transaction.send(headers, body)
  * transaction.commit([callback])
  * transaction.abort()
* channel.close()

## Documentation

* API reference
    * [Client API](http://gdaws.github.io/node-stomp/api/client/)
    * [Channel API](http://gdaws.github.io/node-stomp/api/channel/)
