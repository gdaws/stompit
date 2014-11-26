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
    
    freeExcessTimeout: null
    
  }, options || {});
  
  this._connectFailover = connectFailover;
  
  this._minChannels = options.minChannels;
  this._minFreeChannels = Math.min(options.minFreeChannels, this._minChannels);
  this._maxChannels = options.maxChannels;
  
  this._numChannels = 0;
  
  this._freeChannels = [];
  this._freeExcessTimeout = options.freeExcessTimeout;
  this._freeExcessTimeouts = [];
  
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

ChannelPool.prototype._startIdleListen = function(channel) {
  
  var self = this;
  
  channel.once('idle', function(){
    self._freeChannels.push(channel);
    self._addExcessTimeout();
  });
};

ChannelPool.prototype._allocateBusyChannel = function() {
  
  if (this._freeChannels.length === 0 && !this._allocateFreeChannel()) {
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
  
  return channel;
};

ChannelPool.prototype.channel = function(callback) {
  
  var self = this;
  
  process.nextTick(function() {
    
    var channel = self._allocateBusyChannel();
    
    if (!channel) {
      callback(new Error('failed to allocate channel'));
      return;
    }
    
    callback(null, channel);
  });
};

ChannelPool.prototype._forwardCall = function(method, methodArgs){
  
  this.channel(function(error, channel) {
    
    if (error) {
      
      var brokenConnection = {
        connect: function(callback) {
          process.nextTick(function() {
            callback(error);
          });
        }
      };
      
      channel = new Channel(brokenConnection);
    }
    
    method.apply(channel, methodArgs);
  });
  
};

ChannelPool.prototype.send = function() {
  this._forwardCall(Channel.prototype.send, arguments);
};

module.exports = ChannelPool;
