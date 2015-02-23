# Class: stompit.ChannelPool
---

## new stompit.ChannelPool(connectFailover, [options])

Options:

* `minChannels` `integer` `Default:1` minimum number of channels created. For
   the life cycle of the channel pool, the number of channels allocated will
   not drop below this value.
* `minFreeChannels` `integer` `Default:1` minimum number of spare channels. More
   channels will be created as existing channels become busy.
* `maxChannels` `integer` `Default:Infinity` limit on number of channels 
   allocated concurrently. While this limit is reached, requests for channels
   will be waiting in a queue for busy channels to go idle.
* `freeExcessTimeout` `integer` `Default:0` milliseconds to wait of idle time 
   before a channel is closed and deallocated.

## channelPool.channel(callback)

Request an unused channel and pass it as an argument to the supplied 
callback function.

When a channel emits an `idle` event the pool either closes the channel or
reuses it in another channel request. The idle event is emitted when all send 
and subscribe operations are completed. Be aware, for example that if after the 
first message is sent and there are no other operations running (i.e. sending
messages or subscriptions open) then the channel emits an `idle` event.

## Example

```js
channelPool.channel(function(error, channel) {

});

```
