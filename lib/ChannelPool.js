/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const Channel = require('./Channel');

class ChannelPool {

  constructor(connectFailover, options = {}) {

    if (!(this instanceof ChannelPool)) {
      const object = Object.create(ChannelPool.prototype);
      ChannelPool.apply(object, arguments);
      return object;
    }
    
    options = {
      
      minChannels: 1,

      minFreeChannels: 1,
      
      maxChannels: Infinity,
      
      freeExcessTimeout: null,
      
      requestChannelTimeout: null,

      channelOptions: {},

      ...options      
    };
    
    this._connectFailover = connectFailover;
    
    this._minChannels = options.minChannels;

    this._minFreeChannels = Math.min(
      options.minFreeChannels, this._minChannels
    );

    this._maxChannels = options.maxChannels;
    
    this._channels = [];
    
    this._channelOptions = {...options.channelOptions, alwaysConnected: true};

    this._freeChannels = [];
    this._freeExcessTimeout = options.freeExcessTimeout;
    this._freeExcessTimeouts = [];
    
    this._requestChannelTimeout = options.requestChannelTimeout;
    
    this._closed = false;

    if (this._requestChannelTimeout !== null){
      this._channelRequests = [];
    }
    
    for (let i = 0; i < this._minChannels; i++) {
      this._allocateFreeChannel();
    }
  }

  _createChannel() {
    return new Channel(this._connectFailover, this._channelOptions);
  }

  _allocateFreeChannel() {
    
    if (this._channels.length >= this._maxChannels) {
      return;
    }
    
    const channel = this._createChannel();
    
    this._channels.push(channel);
    
    this._freeChannels.push(channel);
    
    return channel;
  }

  _deallocateChannel(channel) {
    
    channel.close();
      
    const index = this._channels.indexOf(channel);
    
    if (index !== -1) {
      this._channels.splice(index, 1);
    }
  }

  _addExcessTimeout() {
    
    if (this._freeChannels.length <= this._minChannels) {
      return;
    }
    
    const close = () => {
      
      const channel = this._freeChannels.shift();
      
      if (!channel.isEmpty()) {
        this._startIdleListen(channel);
        return;
      }
      
      this._deallocateChannel(channel);
    };
    
    if (this._freeExcessTimeout === null) {
      close();
      return;
    }
    
    this._freeExcessTimeouts.push(setTimeout(() => {
      
      this._freeExcessTimeouts.shift();
      
      if (this._freeChannels.length > this._minChannels) {
        close();
      }
      
    }, this._freeExcessTimeout));
  }

  _hasChannelRequestTimeout() {
    return typeof this._requestChannelTimeout == 'number';
  }

  _startIdleListen(channel) {
    
    channel.once('idle', () => {
      
      if (this._closed) {
        this._deallocateChannel(channel);
        return;
      }

      if (this._hasChannelRequestTimeout() && 
        this._channelRequests.length > 0) {
        
        const channelRequest = this._channelRequests.shift();
        
        clearTimeout(channelRequest.timeout);
        
        this._startIdleListen(channel);
        
        channelRequest.callback(null, channel);
        
        return;
      }
      
      this._freeChannels.push(channel);
      this._addExcessTimeout();
    });
  }

  _timeoutChannelRequest(callback) {
    
    this._channelRequests.shift();
    
    callback(new Error('failed to allocate channel'));
  }

  channel(callback) {
    
    if (this._closed) {
      process.nextTick(function() {
        callback(new Error('channel pool closed'));
      });
      return;
    }

    if (this._freeChannels.length === 0 && !this._allocateFreeChannel()) {
      
      if (this._hasChannelRequestTimeout()) {
        
        const timeout = setTimeout(
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
    
    const channel = this._freeChannels.shift();
    
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
  }

  close() {

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
  }
}

module.exports = ChannelPool;
