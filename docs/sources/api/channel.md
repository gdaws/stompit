# Class: stompit.Channel
---

## new stompit.Channel(connectFailover, [options])

Create a new channel. The `connectFailover` argument is a 
[ConnectFailover](connect-failover.md) object.

Option defaults:
```js
{
    alwaysConnected: false
}
```

The `alwaysConnected` option controls how connections are used. Set `false` 
value to use on-demand mode where a connection is maintained while there are
running operations (e.g. messages being sent and/or subscriptions open), and
the connection is dropped as soon as the last operation completes. Set `true`
value for the channel to always have a connection open.

## channel.send(headers, body, [callback])

Send a message.

The `body` argument can be either a string, buffer or a function that returns a
new and unused `stream.Readable` object. The body function may be called 
multiple times, for the original transmission and for each re-transmission.

## channel.subscribe(headers, onMessageCallback)

Subscribe to consume messages.

### subscription.unsubscribe()

## channel.ack(message)

Calls [client.ack](./client.md#clientackmessage) on the underlying client object.

## channel.nack(message)

Calls [client.nack](./client.md#clientnackmessage) on the underlying client object.

## channel.begin([headers])

Start a transaction.

### transaction.send(headers, body)

### transaction.commit()

### transaction.abort()

## channel.close()

Cancels all current operations. The underlying client is disconnected, even if
the channel is in `alwaysConnected` mode.