/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.ChannelFactory
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var ChannelPool = require('./channel_pool');
var util        = require('util');

function ChannelFactory(connectFailver) {
  
  ChannelPool.call(this, connectFailver, {
    
    minChannels:0,
    minFreeChannels: 0,
    
    maxChannels: Infinity,
    
    freeExcessTimeout: null
  });
  
}

util.inherits(ChannelFactory, ChannelPool);

module.exports = ChannelFactory;
