/*
 * Test stompit.MemorySocket
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var MemorySocket    = require('../../lib/util/MemorySocket');
var assert          = require('assert');
var stream          = require('stream');

describe('MemorySocket', function(){
    
    it('should inherit stream.Duplex', function(){
        assert((new MemorySocket()) instanceof stream.Duplex);
    });
    
    describe('#getPeerSocket', function(){
        
        it('should inherit stream.Duplex', function(){
            assert((new MemorySocket()).getPeerSocket() instanceof stream.Duplex);
        });
    });
    
    it('should write to the peer socket', function(done){
        
        var local = new MemorySocket();
        var peer = local.getPeerSocket();
        
        peer.on('readable', function(){
            
            var chunk = peer.read(9);
            
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
        
        var local = new MemorySocket();
        var peer = local.getPeerSocket();
        
        local.on('readable', function(){
            
            var chunk = local.read(9);
            
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
            
            var local = new MemorySocket(0, {allowHalfOpen: false});
            var peer = local.getPeerSocket();
            
            local.on('close', function(){
                done();
            });
            
            local.destroy();
        });
        
        // it should emit an end event on the peer socket
    });
    
    describe('#end', function(){
        
        it('should emit an end event on the peer socket', function(done){
            
            var local = new MemorySocket();
            var peer = local.getPeerSocket();
            
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
