/*
 * Test stompit.BufferWritable
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var BufferWritable  = require('../../../lib/util/buffer/BufferWritable');
var stream          = require('stream');
var assert          = require('assert');

describe('BufferWritable', function(){
    
    describe('#BufferWritable', function(){
        
        it('should inherit from stream.Writable', function(){
            assert((new BufferWritable(1)) instanceof stream.Writable);
        });
        
        it('should have zero bytes written', function(){
            assert((new BufferWritable(Buffer.alloc(1))).getBytesWritten() === 0);
        });
        
        it('should have uncloned buffer object', function(){
            
            var buffer = Buffer.alloc(0);
            var writable = new BufferWritable(buffer);
            
            assert(writable.getBuffer() === buffer);
        });
    });
    
    describe('#write', function(){
        
        var writable;
        
        beforeEach(function(){
            writable = new BufferWritable(Buffer.alloc(32)); 
        });
        
        it('should have bytes written', function(){
            
            writable.getBuffer()[0] = 0;
            
            writable.write('A');
            
            assert(writable.getBytesWritten() === 1);
            assert(writable.getBuffer()[0] === 'A'.charCodeAt(0));
        });
        
        it('should increment bytes written', function(done){
           
            writable.write('A');
            
            writable.write('B', function(){    
                assert(writable.getBytesWritten() === 2);
                assert(writable.getBuffer()[1] === 'B'.charCodeAt(0));
                done();
            });
        });
    });
});
