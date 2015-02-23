# Class: stompit.ConnectFailover

---

Reconnect management for stompit.Client

## new stompit.ConnectFailover(servers, [options])

The servers parameter is an array of servers where each element is an object of 
server settings (the same options used in [stompt.connect](../connect/)).

Options:

* `initialReconnectDelay` `integer` `Default:10` milliseconds delay of the first 
  reconnect
* `maxReconnectDelay` `integer` `Default:30000` maximum milliseconds delay of 
   any reconnect
* `useExponentialBackOff` `boolean` `Default:true` exponential increase
   in reconnect delay
* `maxReconnects` `integer` `Default:-1` maximum number of failed reconnects 
   consecutively
* `randomize` `boolean` `Default:true` randomly choose a server to use when
  reconnecting
* `connectFunction` `function` `Default:stompit.connect` override the client 
   factory constructor used

## failover.addServer(server)

Append a server to the server list

## failover.connect(callback)

Connect to a server and then callback is called with arguments `error, client, reconnect`.
The error argument will be an Error object if the reconnect limit is reached. 
Reconnect state is not shared between failover.connect calls, each connect
call tracks its own number of reconnects and uses the limits set in the 
ConnectFailover object. The client argument is a [Client](../client/) object 
which is ready to send and subscribe. The reconnect argument is a function to
reconnect to a server and repeat the callback. You don't reuse the client 
object between reconnects; for each callback call a new client object is 
provided.

## Example

```js
var server1 = {
  'host': '172.17.42.1',
  'connectHeaders':{
    'host': '',
    'login': '',
    'passcode': ''
  }
};

var server2 = {
  'host': '172.17.42.2',
  'connectHeaders':{
    'heart-beat': '5000,5000'
    'host': '',
    'login': '',
    'passcode': ''
  }
};

var servers = [server1, server2];

var reconnectOptions = {
  'maxReconnects': 10 
};

var manager = new stompit.ConnectFailover(servers, reconnectOptions);

manager.connect(function(error, client, reconnect) {
  
  if (error) {
    // terminal error, given up reconnecting
    return;
  }
  
  client.on('error', function(error) {
  
    // calling reconnect is optional and you may not want to reconnect if the
    // same error will be repeated.
    
    reconnect();
  });
  
  // use client
});
```
