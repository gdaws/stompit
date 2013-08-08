stompit
==========

[![Build Status](https://travis-ci.org/gdaws/node-stomp.png)](https://travis-ci.org/gdaws/node-stomp)

Stompit is a STOMP 1.2 client for node.js

---
### Client Class

Inherits from event.EventEmitter

#### new stompit.Client(socket)

The socket argument must be an object with the stream.Duplex interface and it 
must be in a state ready for reading and writing. If a TCP socket connection is 
used, for example, then the connection must be in the established state before 
it's used in constructing a new stompit.Client object.

#### client.connect(headers, [callback])

Send the CONNECT frame to the server. The callback is called after the server 
response is accepted.

* headers object
 * `heart-beat` string optional. Set heart-beating time preference. The default 
 value is to set no heart-beating in both directions. Heart beating begins when 
 the CONNECTED frame is received.

#### client.subscribe(headers, onMessageCallback)
Send a subscribe request to the server. The return value is a subscription 
object. The onMessageCallback argument is called each time a message is received 
from the server. The first argument of the callback is a message object.

* headers object
 * `ack` string optional. Set the message acknowledgement mode.
 * `id` string optional. Set the subscription id.

#### client.send(headers, [options])

Send a message to the server. The return value is an outgoing frame object. The 
headers argument is passed to the constructor of the outgoing frame object. 
Transmission of the message begins after the write or end method is called on 
the frame object.

Supports the same options as client.sendFrame method.

#### client.sendFrame(command, headers, [options])

Send a frame to the server.

* options object
 * `onReceipt` callback function. Called when the receipt frame is received.

#### client.begin([options])

Sends a BEGIN frame and returns a new Transaction object. The options argument 
is passed to the internal sendFrame method call.

#### client.disconnect([callback])

Send a DISCONNECT frame to the server and close the write half of the socket. 
The callback argument is called after receiving the receipt frame.
- - -
### Incoming Frame Class

Inherits from stream.Readable

#### frame.headers

An object containing the header entries of the received frame.

#### frame.read([size])

Read data from the frame body. The 'end' event is emitted once either the number 
of bytes read equals the content-length header value, or if the content-length 
header is absent, when a null byte is read.

#### frame.pipe(destination, [options])

- - -
### Outgoing Frame Class

Inherits from stream.Writable

#### frame.headers

An object containing the header entries to be sent.

#### frame.write(chunk, [encoding], [callback])

Write a chunk of the frame body. The frame command and header lines are sent on 
the first write operation.

#### frame.end([chunk], [encoding], [callback])

Call to signal the end of the frame body. Don't include the end-of-frame null 
byte in the end chunk; the frame class writes the null byte for you. Make sure, 
if you've set a content-length header value, that the number of bytes written in 
the frame body doesn't exceed this value. The frame class doesn't check the 
frame body size is consistent with the content-length header value.

- - -
### Message Class

Inherits from the incoming frame class

#### message.ack()

Call to signal that the message has been successfully consumed. The related 
subscription object will send an ACK frame to the server. This method must be 
called even if the subscription is using auto ack mode, so that the message 
can be cleaned up.

#### message.nack()

This method has the same behaviour as the ack method except it's used to signal 
failure to consume the message. 

- - -
### Subscription Class

#### subscription.unsubscribe()

Send UNSUBSCRIBE frame to the server.

---
### Transaction Class

#### transaction.send(headers, [options])

This method wraps the `client.send` method and appends a transaction header. 

#### transaction.abort([options])

Send an ABORT frame to the server. The options argument is passed to the 
internal sendFrame method call.

#### transaction.commit([options])

Send a COMMIT frame to the server. The options argument is passed to the 
internal sendFrame method call.