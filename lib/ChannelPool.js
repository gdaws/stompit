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
    
    requestChannelTimeout: null,

    channelOptions: {}
    
  }, options || {});
  
  this._connectFailover = connectFailover;
  
  this._minChannels = options.minChannels;
  this._minFreeChannels = Math.min(options.minFreeChannels, this._minChannels);
  this._maxChannels = options.maxChannels;
  
  this._channels = [];
  
  this._channelOptions = assign({}, options.channelOptions, {
    alwaysConnected: true
  });

  this._freeChannels = [];
  this._freeExcessTimeout = options.freeExcessTimeout;
  this._freeExcessTimeouts = [];
  
  this._requestChannelTimeout = options.requestChannelTimeout;
  
  this._closed = false;

  if (this._requestChannelTimeout !== null){
    this._channelRequests = [];
  }
  
  for (var i = 0; i < this._minChannels; i++) {
    this._allocateFreeChannel();
  }
}

ChannelPool.prototype._createChannel = function() {

  return new Channel(this._connectFailover, this._channelOptions);
};

ChannelPool.prototype._allocateFreeChannel = function() {
  
  if (this._channels.length >= this._maxChannels) {
    return;
  }
  
  var channel = this._createChannel();
  
  this._channels.push(channel);
  
  this._freeChannels.push(channel);
  
  return channel;
};

ChannelPool.prototype._deallocateChannel = function(channel) {
  
  channel.close();
    
  var index = this._channels.indexOf(channel);
  
  if (index !== -1) {
    this._channels.splice(index, 1);
  }
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
    
    self._deallocateChannel(channel);
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
    
    if (self._closed) {
      self._deallocateChannel(channel);
      return;
    }

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
  
  if (this._closed) {
    process.nextTick(function() {
      callback(new Error('channel pool closed'));
    });
    return;
  }

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

ChannelPool.prototype.close = function() {

  this._closed = true;

  this._channels.forEach(function(channel) {
    channel.close();
  });

  this._channels = [];
  this._freeChannels = [];

  if (this._channelRequests) {

    this._channelRequests.forEach(function(request) {
      clearTimeout(request.timeout);
      request.callback(new Error('channel pool closed'));
    });

    this._channelRequests = [];
  }
};

module.exports = ChannelPool;
