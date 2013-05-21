var MemorySocket = require("../lib/memory_socket");
var assert = require("assert");
var stream = require("stream");

describe("MemorySocket", function(){
    
    it("should inherit stream.Duplex", function(){
        assert((new MemorySocket()) instanceof stream.Duplex);
    });
    
    describe("#getPeerSocket", function(){
        
        it("should inherit stream.Duplex", function(){
            assert((new MemorySocket()).getPeerSocket() instanceof stream.Duplex);
        });
    });
    
    it("should write to the peer socket", function(done){
        
        var local = new MemorySocket();
        var peer = local.getPeerSocket();
        
        peer.on("readable", function(){
            
            var chunk = peer.read(9);
            
            if(chunk !== null){
                assert(chunk.length === 9);
                assert(chunk.slice(0, 9).toString() === "abcdefghi");
                done();
            }
        });
        
        peer.read();
        
        local.write("abcdefghi");
    });
    
    it("should read from the peer socket", function(done){
        
        var local = new MemorySocket();
        var peer = local.getPeerSocket();
        
        local.on("readable", function(){
            
            var chunk = local.read(9);
            
            if(chunk !== null){
                assert(chunk.length === 9);
                assert(chunk.slice(0, 9).toString() === "abcdefghi");
                done();
            }
        });
        
        local.read();
        
        peer.write("abcdefghi");
    });
    
    describe("#destroy", function(){
       
        it("should emit a close event", function(done){
            
            var local = new MemorySocket();
            var peer = local.getPeerSocket();
            
            var localClosed = false;
            var peerClosed = false;
            
            local.on("close", function(){
                
                localClosed = true;
                
                if(localClosed && peerClosed){
                    done();
                }
            });
            
            peer.on("close", function(){
                
                peerClosed = true;
                
                if(localClosed && peerClosed){
                    done();
                }
            });
            
            local.destroy();
        });
    });
    
    describe("#end", function(){
        
        it("should emit an end event on the peer socket", function(done){
            
            var local = new MemorySocket();
            var peer = local.getPeerSocket();
            
            peer.on("end", function(){
                done();
            });
            
            peer.read();
            
            local.end();
        });
    });
});
