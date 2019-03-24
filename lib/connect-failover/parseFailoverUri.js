/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true, esversion: 9 */

const { parse } = require('qs');
const { existsSync, readFileSync } = require('fs');

function parseFailoverUri(uri) {
  
  let serverList = uri;
  let optionsQueryString = null;

  const comps = uri.match(/^failover:\(([^\)]*)\)(\?.*)?$/);
  
  if (comps) {
    serverList = comps[1];
    optionsQueryString = comps[2] ? comps[2].substring(1) : void 0;
  }
  
  const servers = serverList.length > 0 ? serverList.split(',') : [];
  
  const options = optionsQueryString ? 
    parseObject(parse(optionsQueryString)) : {};
  
  const normalizer = new OptionsNormalizer(options);
  
  normalizer.floatProperty('initialReconnectDelay',   0, Infinity);
  normalizer.floatProperty('maxReconnectDelay',       0, Infinity);
  normalizer.floatProperty('reconnectDelayExponent',  0, Infinity);
  normalizer.floatProperty('maxReconnects',          -1, Infinity);
  
  normalizer.boolProperty('useExponentialBackOff');
  normalizer.boolProperty('randomize');

  if (typeof options.connect === 'object') {
    
    const connectOptionsNormalizer = new OptionsNormalizer(options.connect);
    
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

const parseString = function(value) {
  value = '' + value;
  const valueLC = value.toLowerCase();
  if (valueLC === 'false') {
    value = false;
  }
  else if (valueLC === 'true') {
    value = true;
  }
  else {
    if (value.match(/^-?[0-9]+(\.[0-9]+)?$/) !== null) {
      const num = parseFloat(value, 10);
      if (!isNaN(num)) {
        value = num; 
      }
    }
  }
  return value;
};

const parseObject = function(object) {
  const out = {};
  for (const key in object) {
    let value = object[key];
    const type = typeof value;
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
  
  let value = this.options[name];
  
  if (value === void 0) {
    return;
  }
  
  const type = typeof value;
  
  if (type === 'number') {
    value = Boolean(value);
  }
  
  if (typeof value !== 'boolean') {
    
    const message = 'invalid ' + name + ' value \'' + this.options[name] + 
      '\' (expected boolean)';
    
    throw new Error(message);
  }
  
  this.options[name] = value;
};

OptionsNormalizer.prototype.floatProperty = function(name, lowest, greatest) {
  
  const value = this.options[name];
  
  if (value === void 0) {
    return;
  }
  
  if (typeof value !== 'number' || value < lowest || value > greatest) {
    
    const message = 'invalid ' + name + ' value \'' + this.options[name] + 
      '\' (expected number between ' + lowest + ' and ' + greatest + ')';
    
    throw new Error(message);
  }
  
  this.options[name] = value;
};

OptionsNormalizer.prototype.fileProperty = function(name) {
  
  const filename = this.options[name];
  
  if(filename === void 0) {
    return;
  }
  
  if (!existsSync(filename)) {
    
    const message = 'invalid ' + name + ' file not found \'' + 
      filename + '\'';
    
    throw new Error(message);
  }
  
  this.options[name] = readFileSync(filename);
};

module.exports = parseFailoverUri;
