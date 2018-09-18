/*
 * Test stompit.BufferReadable
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var BufferReadable  = require('../../../lib/util/buffer/BufferReadable');
var stream          = require('stream');
var assert          = require('assert');

describe('BufferReadable', function(){
    
    it('should inherit from stream.Readable', function(){
        assert((new BufferReadable(1)) instanceof stream.Readable);
    });
    
    it('should have zero bytes read', function(){
        assert((new BufferReadable(Buffer.alloc(1))).getBytesRead() === 0);
    });
    
    it('should have uncloned buffer object', function(){
        
        var buffer = Buffer.alloc(0);
        var readable = new BufferReadable(buffer);
        
        assert(readable.getBuffer() === buffer);
    });
    
    describe('#read', function(){
        
        it('should read bytes', function(){
            
            var buffer = Buffer.from('hello');
            var readable = new BufferReadable(buffer);
            
            assert(readable.read(5).toString() === 'hello');
            assert(readable.getBytesRead() === 5);
        });
        
        it('should push EOF chunk', function(done){
            
            var buffer = Buffer.from('hello');
            var readable = new BufferReadable(buffer);
            
            readable.on('end', function(){
                done();
            });
            
            while(readable.read() !== null);
        });
    });
});
