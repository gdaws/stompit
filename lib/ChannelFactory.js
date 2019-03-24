/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const ChannelPool = require('./ChannelPool');

class ChannelFactory extends ChannelPool {

  constructor(connectFailover) {
    super(connectFailover, {

      minChannels: 0,
      minFreeChannels: 0,

      maxChannels: Infinity,

      freeExcessTimeout: null
    });
  }
}

module.exports = ChannelFactory;
