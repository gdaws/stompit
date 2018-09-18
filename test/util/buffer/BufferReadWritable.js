/*
 * Test stompit.BufferReadWritable
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var BufferReadWritable  = require('../../../lib/util/buffer/BufferReadWritable');
var BufferWritable      = require('../../../lib/util/buffer/BufferWritable');
var assert              = require('assert');

describe('BufferReadWritable', function(){
    
    it('should be readable after write', function(){
        
        var iostream = new BufferReadWritable(Buffer.alloc(2));
        
        assert(iostream.write('A'));
        
        assert(iostream.getBytesWritten() === 1);
        assert(iostream.getBytesReadable() === 1);
        
        assert(iostream.getBytesWritable() === 1);
        
        var chunk = iostream.read();
        
        assert(chunk.length === 1);
        assert(chunk[0] === 'A'.charCodeAt(0));
        
        assert(iostream.getBytesReadable() === 0);
        assert(iostream.getBytesWritable() === 2);
    });
    
    it('should recyle the buffer', function(done){
        
        var iostream = new BufferReadWritable(Buffer.alloc(2), {
            highWaterMark: 0
        });
        
        iostream.write('AB', function(){
            
            assert(iostream.getBytesReadable() === 2);
            assert(iostream.getBytesWritten() === 2);
            
            var chunk1 = iostream.read(1);
                    
            iostream.write('C', function(){
                
                var chunk2 = iostream.read(2);
                
                assert(chunk1.length === 1);
                assert(chunk2.length === 2);
                
                assert(chunk1[0] === 'A'.charCodeAt(0));
                assert(chunk2[0] === 'B'.charCodeAt(0) && chunk2[1] === 'C'.charCodeAt(0));
                
                assert(iostream.getBytesReadable() === 0);
                assert(iostream.getBytesWritable() === 2);
                
                assert(iostream.getBytesWritten() === 3);
                assert(iostream.getBytesRead() === 3);
                
                done();
            });
        });
    });
    
    it('should be able to transfer a chunk that is bigger than the buffer', function(done){
        
        var iostream = new BufferReadWritable(Buffer.alloc(2), {
            highWaterMark: 0
        });
        
        var checkBuffer = Buffer.alloc(9);
        
        var finishedWriting = false;
        var finishedReading = false;
        
        iostream.write('ABCDEFGHI', function(){
            
            assert(iostream.getBytesWritten() === 9);
            
            finishedWriting = true;
            
            if(finishedReading && finishedWriting){
                done();
            }
        });
        
        iostream.read(9);
        
        iostream.on('readable', function(){
           
            var chunk = iostream.read(9);
            
            if(chunk !== null){
                
                assert(chunk.length === 9);
                assert(chunk.slice(0, 9).toString() === 'ABCDEFGHI');
                
                finishedReading = true;
                
                if(finishedReading && finishedWriting){
                    done();
                }
            }
        });
    });
});
