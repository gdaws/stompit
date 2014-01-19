# stompit

A STOMP client library for node.js

Compatible with STOMP 1.0, 1.1 and 1.2 servers.

[![Build Status](https://travis-ci.org/gdaws/node-stomp.png)](https://travis-ci.org/gdaws/node-stomp)

Send message:

```javascript
require('stompit')
 .broker('failover:(tcp://localhost:61613,tcp://localhsot:61614)?randomize=false')
 .send('/queue/a', 'hello queue a', function(error) {
   if (!error) {
     console.log('message sent');
   }
 });
```

Receive messages:

```javascript
require('stompit')
 .broker()
 .subscribe('/queue/a', function(error, message){
    if (!error) {
      message.pipe(somethingWritable).on('end', function() {
        console.log('message received');
        message.ack();
      });
    }
 });
```

## Features

* Transport agnostic - the client can run over anything implementing Stream.Duplex;
* Streaming - the application directly controls the reading and writing of frame body content;
* High-level API - automatic connection management and failover;
* Low-level API - socket-like interface with manual connection management and error handling.

## Install

 `npm install stompit`

## Documentation

* [API documentation](http://gdaws.github.io/node-stomp/api/)
