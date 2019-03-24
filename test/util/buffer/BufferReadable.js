/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const BufferReadable  = require('../../../lib/util/buffer/BufferReadable');
const { Readable } = require('stream');
const assert = require('assert');

describe('BufferReadable', function(){
    
    it('should inherit from stream.Readable', function(){
        assert((new BufferReadable(1)) instanceof Readable);
    });
    
    it('should have zero bytes read', function(){
        assert((new BufferReadable(Buffer.alloc(1))).getBytesRead() === 0);
    });
    
    it('should have uncloned buffer object', function(){
        
        const buffer = Buffer.alloc(0);
        const readable = new BufferReadable(buffer);
        
        assert(readable.getBuffer() === buffer);
    });
    
    describe('#read', function(){
        
        it('should read bytes', function(){
            
            const buffer = Buffer.from('hello');
            const readable = new BufferReadable(buffer);
            
            assert(readable.read(5).toString() === 'hello');
            assert(readable.getBytesRead() === 5);
        });
        
        it('should push EOF chunk', function(done){
            
            const buffer = Buffer.from('hello');
            const readable = new BufferReadable(buffer);
            
            readable.on('end', function(){
                done();
            });
            
            while(readable.read() !== null);
        });
    });
});
