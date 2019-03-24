/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const BufferWritable  = require('../../../lib/util/buffer/BufferWritable');
const { Writable } = require('stream');
const assert = require('assert');

describe('BufferWritable', function(){
    
    describe('#BufferWritable', function(){
        
        it('should inherit from stream.Writable', function(){
            assert((new BufferWritable(1)) instanceof Writable);
        });
        
        it('should have zero bytes written', function(){
            assert((new BufferWritable(Buffer.alloc(1))).getBytesWritten() === 0);
        });
        
        it('should have uncloned buffer object', function(){
            
            const buffer = Buffer.alloc(0);
            const writable = new BufferWritable(buffer);
            
            assert(writable.getBuffer() === buffer);
        });
    });
    
    describe('#write', function(){
        
        let writable;
        
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
