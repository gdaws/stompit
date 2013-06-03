stompit
==========

A STOMP client and server library in node.js

### Client Class

Inherits from event.EventEmitter

#### new stompit.Client(socket)

The socket object argument is assumed to be a tcp socket and be in the established connection state. The constructor does nothing more than initialise the new client object.

#### client.connect(headers, [callback])

Send the CONNECT frame to the server. The callback is called  after the server response is accepted.

#### client.subscribe(headers, onMessageCallback)
Send a subscribe request to the server. The return value is a subscription object. The onMessageCallback argument is called each time a message is received from the server. The first argument of the callback is a message object.

#### client.send(headers, [options])
Send a message to the server. The return value is an outgoing frame object. The headers argument is passed to the constructor of the outgoing frame object. Transmission of the message begins after the write or end method is called on the frame object.

#### client.disconnect([callback])

Send a DISCONNECT frame to the server and close the write half of the socket. The callback argument is called after receiving the receipt frame.

### Incoming Frame Class

Inherits from stream.Readable

#### frame.headers
#### frame.write(chunk, [encoding], [callback])
#### frame.end()

### Outgoing Frame Class

Inherits from stream.Writable

#### frame.headers
#### frame.read()
#### frame.pipe()

### Message Class

Inherits from the incoming frame class

#### message.ack()
#### message.nack()

### Subscription class

#### subscription.unsubscribe()
