/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.ChannelFactory
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var ChannelPool = require('./ChannelPool');
var util        = require('util');

function ChannelFactory(connectFailover) {
  
  ChannelPool.call(this, connectFailover, {
    
    minChannels:0,
    minFreeChannels: 0,
    
    maxChannels: Infinity,
    
    freeExcessTimeout: null
  });
  
}

util.inherits(ChannelFactory, ChannelPool);

module.exports = ChannelFactory;
