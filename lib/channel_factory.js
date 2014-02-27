/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.ChannelFactory
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var ConnectFailover = require('./connect_failover');
var Channel = require('./channel');

function ChannelFactory() {
  
  if (arguments.length > 0  && arguments[0] instanceof ConnectFailover) {
    this._conenctFailover = arguments[0];
  }
  else {
    this._connectFailover = Object.create(ConnectFailover.prototype);
    ConnectFailover.apply(this._conenctFailover, arguments);
  }
}

ChannelFactory.prototype.channel = function() {
  return new Channel(this._connectFailover);
};

ChannelFactory.prototype.send = function() {
  var channel = this.channel();
  channel.send.apply(channel, arguments);
  return channel;
};

ChannelFactory.prototype.subscribe = function() {
  var channel = this.channel();
  channel.subscribe.apply(channel, arguments);
  return channel;
};

ChannelFactory.prototype.begin = function() {
  var channel = this.channel();
  channel.begin.apply(channel, arguments);
  return channel;
};
