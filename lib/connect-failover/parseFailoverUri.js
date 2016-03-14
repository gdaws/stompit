/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */

/*
 * stompit.Failover
 * Copyright (c) 2013-2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var qs = require('qs');
var fs = require('fs');

function parseFailoverUri(uri) {
  
  var serverList = uri;
  var optionsQueryString = null;

  var comps = uri.match(/^failover:\(([^\)]*)\)(\?.*)?$/);
  
  if (comps) {
    serverList = comps[1];
    optionsQueryString = comps[2] ? comps[2].substring(1) : void 0;
  }
  
  var servers = serverList.length > 0 ? serverList.split(',') : [];
  
  var options = optionsQueryString ? 
    parseObject(qs.parse(optionsQueryString)) : {};
  
  var normalizer = new OptionsNormalizer(options);
  
  normalizer.floatProperty('initialReconnectDelay',   0, Infinity);
  normalizer.floatProperty('maxReconnectDelay',       0, Infinity);
  normalizer.floatProperty('reconnectDelayExponent',  0, Infinity);
  normalizer.floatProperty('maxReconnects',          -1, Infinity);
  
  normalizer.boolProperty('useExponentialBackOff');
  normalizer.boolProperty('randomize');

  if (typeof options.connect === 'object') {
    
    var connectOptionsNormalizer = new OptionsNormalizer(options.connect);
    
    connectOptionsNormalizer.boolProperty('ssl');
    
    connectOptionsNormalizer.fileProperty('pfx');
    connectOptionsNormalizer.fileProperty('key');
    connectOptionsNormalizer.fileProperty('cert');
    connectOptionsNormalizer.fileProperty('ca');
  }
  
  return {
    servers: servers,
    options: options
  };
}

var parseString = function(value) {
  value = '' + value;
  var valueLC = value.toLowerCase();
  if (valueLC === 'false') {
    value = false;
  }
  else if (valueLC === 'true') {
    value = true;
  }
  else {
    if (value.match(/^-?[0-9]+(\.[0-9]+)?$/) !== null) {
      var num = parseFloat(value, 10);
      if (!isNaN(num)) {
        value = num; 
      }
    }
  }
  return value;
};

var parseObject = function(object) {
  var out = {};
  for (var key in object) {
    var value = object[key];
    var type = typeof value;
    if (type === 'object' || type === 'array') {
      value = parseObject(value);
    }
    else {
      value = parseString(value);
    }
    out[key] = value;
  }
  return out;
};

function OptionsNormalizer(options) {
  this.options = options;
}

OptionsNormalizer.prototype.boolProperty = function(name) {
  
  var value = this.options[name];
  
  if (value === void 0) {
    return;
  }
  
  var type = typeof value;
  
  if (type === 'number') {
    value = Boolean(value);
  }
  
  if (typeof value !== 'boolean') {
    
    var message = 'invalid ' + name + ' value \'' + this.options[name] + 
      '\' (expected boolean)';
    
    throw new Error(message);
  }
  
  this.options[name] = value;
};

OptionsNormalizer.prototype.floatProperty = function(name, lowest, greatest) {
  
  var value = this.options[name];
  
  if (value === void 0) {
    return;
  }
  
  if (typeof value !== 'number' || value < lowest || value > greatest) {
    
    var message = 'invalid ' + name + ' value \'' + this.options[name] + 
      '\' (expected number between ' + lowest + ' and ' + greatest + ')';
    
    throw new Error(message);
  }
  
  this.options[name] = value;
};

OptionsNormalizer.prototype.fileProperty = function(name) {
  
  var filename = this.options[name];
  
  if(filename === void 0) {
    return;
  }
  
  if (!fs.existsSync(filename)) {
    
    var message = 'invalid ' + name + ' file not found \'' + 
      filename + '\'';
    
    throw new Error(message);
  }
  
  this.options[name] = fs.readFileSync(filename);
};

module.exports = parseFailoverUri;
