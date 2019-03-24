/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const MemorySocket = require('../../lib/util/MemorySocket');
const { Duplex } = require('stream');
const assert = require('assert');

describe('MemorySocket', function(){
    
    it('should inherit stream.Duplex', function(){
        assert((new MemorySocket()) instanceof Duplex);
    });
    
    describe('#getPeerSocket', function(){
        
        it('should inherit stream.Duplex', function(){
            assert((new MemorySocket()).getPeerSocket() instanceof Duplex);
        });
    });
    
    it('should write to the peer socket', function(done){
        
        const local = new MemorySocket();
        const peer = local.getPeerSocket();
        
        peer.on('readable', function(){
            
            const chunk = peer.read(9);
            
            if(chunk !== null){
                assert(chunk.length === 9);
                assert(chunk.slice(0, 9).toString() === 'abcdefghi');
                done();
            }
        });
        
        peer.read();
        
        local.write('abcdefghi');
    });
    
    it('should read from the peer socket', function(done){
        
        const local = new MemorySocket();
        const peer = local.getPeerSocket();
        
        local.on('readable', function(){
            
            const chunk = local.read(9);
            
            if(chunk !== null){
                assert(chunk.length === 9);
                assert(chunk.slice(0, 9).toString() === 'abcdefghi');
                done();
            }
        });
        
        local.read();
        
        peer.write('abcdefghi');
    });
    
    describe('#destroy', function(){
       
        it('should emit a close event', function(done){
            
            const local = new MemorySocket(0, {allowHalfOpen: false});
            
            local.on('close', function(){
                done();
            });
            
            local.destroy();
        });
        
        // it should emit an end event on the peer socket
    });
    
    describe('#end', function(){
        
        it('should emit an end event on the peer socket', function(done){
            
            const local = new MemorySocket();
            const peer = local.getPeerSocket();
            
            peer.on('end', function(){
                done();
            });
            
            peer.on('readable', function(){
                peer.read(); 
            });
            
            local.end();
            peer.read();
        });
    });
});
