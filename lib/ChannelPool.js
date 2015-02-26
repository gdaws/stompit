/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */
/*
 * stompit.ChannelPool
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */
 
var Channel         = require('./Channel');
var assign          = require('object-assign');

function ChannelPool(connectFailover, options) {
  
  if (!(this instanceof ChannelPool)) {
    var object = Object.create(ChannelPool.prototype);
    ChannelPool.apply(object, arguments);
    return object;
  }
  
  options = assign({
    
    minChannels: 1,
    
    minFreeChannels: 1,
    
    maxChannels: Infinity,
    
    freeExcessTimeout: null,
    
    requestChannelTimeout: null
    
  }, options || {});
  
  this._connectFailover = connectFailover;
  
  this._minChannels = options.minChannels;
  this._minFreeChannels = Math.min(options.minFreeChannels, this._minChannels);
  this._maxChannels = options.maxChannels;
  
  this._numChannels = 0;
  
  this._freeChannels = [];
  this._freeExcessTimeout = options.freeExcessTimeout;
  this._freeExcessTimeouts = [];
  
  this._requestChannelTimeout = options.requestChannelTimeout;
  
  if (this._requestChannelTimeout !== null){
    this._channelRequests = [];
  }
  
  for (var i = 0; i < this._minChannels; i++) {
    this._allocateFreeChannel();
  }
}

ChannelPool.prototype._createChannel = function() {
  
  return new Channel(this._connectFailover, {
    alwaysConnected: true
  });
};

ChannelPool.prototype._allocateFreeChannel = function() {
  
  if (this._numChannels >= this._maxChannels) {
    return;
  }
  
  var channel = this._createChannel();
  
  this._numChannels += 1;
  
  this._freeChannels.push(channel);
  
  return channel;
};

ChannelPool.prototype._addExcessTimeout = function() {
  
  if (this._freeChannels.length <= this._minChannels) {
    return;
  }
  
  var self = this;
  
  var close = function() {
    
    var channel = self._freeChannels.shift();
    
    if (!channel.isEmpty()) {
      self._startIdleListen(channel);
      return;
    }
    
    channel.close();
    
    self._numChannels -= 1;
  };
  
  if (this._freeExcessTimeout === null) {
    close();
    return;
  }
  
  this._freeExcessTimeouts.push(setTimeout(function() {
    
    self._freeExcessTimeouts.shift();
    
    if (self._freeChannels.length > self._minChannels) {
      close();
    }
    
  }, this._freeExcessTimeout));
};

ChannelPool.prototype._hasChannelRequestTimeout = function() {
  return typeof this._requestChannelTimeout == 'number';
};

ChannelPool.prototype._startIdleListen = function(channel) {
  
  var self = this;
  
  channel.once('idle', function(){
    
    if (self._hasChannelRequestTimeout() && self._channelRequests.length > 0) {
      
      var channelRequest = self._channelRequests.shift();
      
      clearTimeout(channelRequest.timeout);
      
      self._startIdleListen(channel);
      
      channelRequest.callback(null, channel);
      
      return;
    }
    
    self._freeChannels.push(channel);
    self._addExcessTimeout();
  });
};

ChannelPool.prototype._timeoutChannelRequest = function(callback) {
  
  this._channelRequests.shift();
  
  callback(new Error('failed to allocate channel'));
};

ChannelPool.prototype.channel = function(callback) {
  
  if (this._freeChannels.length === 0 && !this._allocateFreeChannel()) {
    
    if (this._hasChannelRequestTimeout()) {
      
      var timeout = setTimeout(
        this._timeoutChannelRequest.bind(this, callback), 
        this._requestChannelTimeout
      );
      
      this._channelRequests.push({
        timeout: timeout,
        callback: callback
      });
    }
    else {
      process.nextTick(function() {
        callback(new Error('failed to allocate channel'));
      });
    }
    
    return;
  }
  
  var channel = this._freeChannels.shift();
  
  if (this._freeExcessTimeouts.length > 0) {
    clearTimeout(this._freeExcessTimeouts.shift());  
  }
  
  if (this._freeChannels.length < this._minFreeChannels) {
    this._allocateFreeChannel();
  }
  
  this._startIdleListen(channel);
  
  process.nextTick(function() {
    callback(null, channel);
  });
};

module.exports = ChannelPool;
