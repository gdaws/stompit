/*jslint node: true, indent: 2, unused: true */
/*
 * stompit error classes
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var util = require('./util');

module.exports = {
  TransportError: util.defineErrorClass('Transport error'),
  ProtocolError:  util.defineErrorClass('Protocol error'),
  ApplicationError: util.defineErrorClass('Application error')
};
