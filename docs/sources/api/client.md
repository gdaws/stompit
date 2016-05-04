# Class: stompit.Client

---

## new stompit.Client(transport, [options])

The transport parameter expects a `stream.Duplex` object argument. The transport 
must be in a connecting or connected state.

The constructor is useful if you're using a custom transport such as a transform
stream. However, if you are using any of the standard transports then you should
avoid using the constructor and instead use the much more convenient 
[stompit.connect](../connect/) function to instantiate a stompit.Client object 
and establish a connection.

Options:

* `heartbeatDelayMargin` `Number` `Default:100`: Milliseconds added to the
heart-beat receive frequency to allow for delay variations.

## client.connect(headers, [callback])

Send a CONNECT frame to the server.

If a callback function argument is given then it's called on connect
event (i.e when the CONNECTED frame is received from the server).

Caution: don't call this method if the client object was obtained from calling
the stompit.connect function.

## client.disconnect([callback])

Disconnect from server. A DISCONNECT frame is sent with a receipt request. No
further transmissions are permitted while the disconnect is pending. The server
should reply with a disconnect receipt and end the connection once all messages 
sent from the client are acknowledged.

The `callback` function is called when the connection is closed or when an
error occurs.

## client.destroy([error])

Close the connection immediately without warning the server. A DISCONNECT frame
is not sent.

If an error argument is given then an error event is emitted from the client.

## client.send(headers, [options])

Send or publish a message. This method returns a `stream.Writable` object for 
you to write the message content. The frame headers are transmitted once
the message content writing begins i.e. on the first call to the write method.

Options:

* `onReceipt` is a callback function that will be called when the receipt frame
for this message is received from the server. You don't have to include a 
receipt header to enable this functionality - the send method appends a receipt 
header if the onReceipt property is defined.

## client.sendFrame(command, headers, [options])

Send a frame to the server. A `stream.Writable` object is returned that's used
for writing the frame body content.

For available options see client.send method.

## client.subscribe(headers, onMessageCallback)

Create a new subscription. The `onMessageCallback` function is called for each
consecutive message received.

If a message cannot be fully read then the client must terminate the connection
 using the [client.destroy](#clientdestroyerror) method.

The `onMessageCallback` function has the parameters `error, message`. The 
message object has `headers` property and extends `stream.Readable` for reading
the message body.

### message.ack()

This method is deprecated and will be removed in a future version of Stompit.
Use `client.ack` method instead.

### message.nack()


This method is deprecated and will be removed in a future version of Stompit.
Use `client.nack` method instead.

## client.ack(message)

Send an ACK frame to acknowledge the consumption of `message`.

## client.nack(message)

Send a NACK frame to negatively acknowledge that `message` was not accepted for
consumption.

## client.begin([headers])

Create a transaction.

### transaction.send(headers, [options])

Same behaviour as [client.send](#clientsendheaders-options) method.

### transaction.commit([options])

Commit the transaction. Use the `onReceipt` option to get confirmation from the 
server that this transaction was successfully committed.

On error, the server terminates the connection and an `error` event is emitted
from the client object.

### transaction.abort([options])

Abort the transaction.
