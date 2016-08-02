# Function: stompit.connect

---

Creates a [stompit.Client](../client/) object and connects to a server. 
The `connectionListener` callback (an observer of the client object's `connect` 
event) is called when the client is connected and is ready to send and subscribe.

The return value is a new client object.

Supported call patterns:

* `stompit.connect(options, [connectionListener])`
* `stompit.connect(port, [host], [connectionListener])`
* `stompit.connect(path, [connectionListener])`

Options:

* `host` `string` `Default:"localhost"` remote host address
* `port` `integer` `Default:61613` remote port address
* `timeout` `integer` `Default:3000` timeout for the transport connect operation
* `connectHeaders` `object` `Default:{}` headers to be sent in the connect frame
* `path` `string` use unix domain socket and use path as the destination address
* `ssl` `boolean` `Default:false` use secure connection
* `connect` `function` override the transport factory constructor used
* `heartbeatDelayMargin` `integer` `Default:100` add milliseconds for server heart-beat wait interval
* `heartbeatOutputMargin` `integer` `Default:0` substract milliseconds for client heart-beat start interval

Options available when ssl is set to true:

* `pfx` `string or Buffer` private key, certificate and CA certs of client in
  PFX or PKC12 format.
* `key` `string or Buffer` private key of the client in PEM format
* `passphrase` `string` passhrase for the private key
* `cert` `string or Buffer` containing the certificate file of the client in PEM
  format
* `ca` array of strings of Buffers of trusted certificates in PEM format

Under the hood `net.connect` and `tls.connect` functions are used so any options
they have available that are undocumented here are also applicable to
`stompit.connect` function.

## Standard headers

Set the `connectHeaders` option with an object containing the headers to be
included in the connect frame. Below are the list of standard headers supported
by STOMP servers.

* `accept-version` negotiate protocol version. By default stompit accepts 
  "1.0,1.1,1.2"
* `heart-beat` enable heart-beating. Format of header value: `x,y` where x and y
  are the number of milliseconds between heart-beats sent and received 
  respectively.
* `host` virtual host name of server
* `login` client username
* `passcode` client password


## Example

```js
var connectOptions = {
  'host': 'localhost',
  'port': 61613,
  'connectHeaders':{
    'heart-beat': '1000,2000',
    'host': 'localhost',
    'login': 'username',
    'passcode': 'password'
  }
};

stompit.connect(connectOptions, function(error, client) {
  
});
```
