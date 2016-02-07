# Class: stompit.Client

---

## new stompit.Client(transport, [options])

The transport parameter expects a `stream.Duplex` object argument. The transport 
must be in a connecting or connected state.

The constructor is useful if you're using a custom transport such a transform
stream. However, if you are using any of the standard transports then you should
avoid using the constructor and instead use the much more convenient 
[stompit.connect](../connect/) function to instantiate a stompit.Client object and establish
a connection.

Options:

* `heartbeat` `Array` `Default:[0,0]`: Set the preferred heart beat timings, in 
milliseconds. The first element is the send frequency. The Client class will try 
to ensure the send frequency is reached by sending frame trailer bytes if the 
application is not creating busy enough traffic. The second element is the 
expected receive frequency; i.e. the client expects to see an increase in the 
number of bytes received on the socket every n milliseconds).

* `heartbeatDelayMargin` `Number` `Default:100`: Milliseconds added to the
heart-beat receive frequency to allow for delay variations.

## client.connect(headers, [callback])

Send a CONNECT frame to the server.

If a callback function argument is given then it will be called on connect
event.

Note: you must not call this method if you used stompit.connect function.

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

Important headers:

* `destination` is a required property of the headers parameter.
* `content-length` is an optional property of the header parameter if sending 
text data and is a required property if sending binary data.

Options:

* `onReceipt` is a callback function that will be called when the receipt frame
for this message is received from the server. You don't have to include a 
receipt header to enable this functionality - the send method appends a receipt 
header if the onReceipt property is defined.

## client.sendFrame(command, headers, [options])

Send a frame to the server. A `stream.Writable` object is returned for you
to write the frame body.

For available options see client.send method.

## client.subscribe(headers, onMessageCallback)

Create a new subscription. A SUBSCRIBE frame is sent with the headers set in the
`headers` argument. The `onMessageCallback` function is called each time a new
message is received. Every message must be read and acknowledged, even if you 
don't consume the message in your application (in this case you would send a 
negative acknowledgment). You must not ignore a message, doing so would block
other communications with the client. If you are unable to read a message then 
you must terminate the connection using the [client.destroy](#clientdestroyerror) 
method.

Important headers:

* `destination`: required by the server
* `ack`: set the message acknowledgment mode, having value `'auto'`, `'client'` or `'client-individual'`

The `onMessageCallback` function has the parameters `error, message`. The 
message object extends `stream.Readable`

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

Creates a transaction. A BEGIN frame is sent to the server. A transaction object
is returned from the method. The transaction object will append a transaction 
identification header to any related outgoing frames.

### transaction.send(headers, [options])

Same behaviour as [client.send](#clientsendheaders-options) method.

### transaction.commit([options])

Commit the transaction. A COMMIT frame is sent to the server. Use the `onReceipt`
option to get confirmation from the server that this transaction was successfully
committed.

The server may terminate the connection with an error frame if it cannot commit
the transaction. In this case, an `error` event would be emitted from the client
object.

### transaction.abort([options])

Abort the transaction. An ABORT frame is sent to the server.