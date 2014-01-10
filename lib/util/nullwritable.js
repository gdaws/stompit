/*
 * stompit.NullWritable
 * Copyright (c) 2014 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var stream = require('stream');
var util = require('util');

function NullWritable(){
    
    stream.Writable.call(this);
    
    this.bytesWritten = 0;
}

util.inherits(NullWritable, stream.Writable);

NullWritable.prototype._write = function(chunk, encoding, callback){
    this.bytesWritten += chunk.length;
    callback();
};

module.exports = NullWritable;