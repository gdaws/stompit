# Class: stompit.ConnectFailover

---

Connection failover management for stompit.Client

## new stompit.ConnectFailover(servers, [options])

The servers parameter is an array of servers where each element is an object 
containing server settings (the same settings used in [stompt.connect](../connect/)).

Options:

* `initialReconnectDelay` `integer` `Default:10` milliseconds delay of the first reconnect
* `maxReconnectDelay` `integer` `Default:30000` maximum milliseconds delay of any reconnect
* `useExponentialBackOff` `boolean` `Default:true` exponential increase in reconnect delay
* `maxReconnects` `integer` `Default:-1` maximum number of failed reconnects consecutively
* `randomize` `boolean` `Default:true` randomly choose a server when reconnecting
* `connectFunction` `function` `Default:stompit.connect` override the client factory constructor

## failover.addServer(server)

Append a server to the server list

## failover.connect(callback)

Connects to a server and provides the callback with a new client object. The 
callback parameters are `error, client, reconnect`. The reconnect argument is
a function that can be used to create a new connection and client when an error
event is detected on the current client. The purpose of the reconnect function
is to choose the next server and reconnect time based on the previous reconnects
state. The reconnect state is stored in the reconnect-connect closure.

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
