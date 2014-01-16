/*jslint node: true, indent: 2, unused: true */
/*
 * stompit utility functions
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var util    = require('util');
var fs      = require('fs');
var path    = require('path');

function extend(destination){
  
  var argc = arguments.length;
  
  for(var i = 1; i < argc; i++){
    
    var source = arguments[i];
    
    if(source){
      for(var key in source){
        destination[key] = source[key];
      }
    }
  }
  
  return destination;
}

function readPackageJson(){
  return JSON.parse(fs.readFileSync(path.dirname(module.filename) + '/../package.json'));
}

function defineErrorClass(prefix){
  
  var newClass = function(message){
    this.message = (prefix ? prefix + ': ' : '') + message;
  };
  
  util.inherits(newClass, Error);
  
  return newClass;
}

module.exports = extend(util, {
  extend: extend,
  readPackageJson: readPackageJson,
  defineErrorClass: defineErrorClass
});
