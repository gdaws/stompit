
var FrameOutputStream = require("../lib/frame_output_stream");
var BufferWritable = require("../lib/buffer_writable");
var stream = require("stream");
var assert = require("assert");

describe("FrameOutputStream", function(){
    
    describe("#frame", function(){
        
        var dest;
        var writable;
        var output;
        
        beforeEach(function(){
            dest = new Buffer(256);
            writable = new BufferWritable(dest);
            output = new FrameOutputStream(writable);
        });
        
        it("should return a stream.Writable object", function(){
            assert(output.frame("CONNECT") instanceof stream.Writable);
        });
        
        describe("OutgoingFrame", function(){
            
            describe("#end", function(){
                
                it("should write empty body frame", function(done){
                    
                    var frame = output.frame("CONNECT", {
                        "accepted-version": "1.1",
                        "host": "example.com"
                    });
                    
                    frame.end(function(error){
                        assert(!error);
                        var expected = "CONNECT\naccepted-version:1.1\nhost:example.com\n\n\x00";
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
                
                it("should write non-empty body frame", function(done){
                   
                   var frame = output.frame("CONNECT", {
                        "accepted-version": "1.1",
                        "host": "example.com"
                    });
                    
                    frame.end("Body", function(error){
                        assert(!error);
                        var expected = "CONNECT\naccepted-version:1.1\nhost:example.com\n\nBody\x00";
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
            });
            
            describe("#write", function(){
                
                it("should write header and body before #end is called", function(done){
                    
                    var frame = output.frame("CONNECT", {
                       "accepted-version": "1.1",
                       "host": "example.com"
                    });
                    
                    frame.write("Body", function(error){
                        assert(!error);
                        var expected = "CONNECT\naccepted-version:1.1\nhost:example.com\n\nBody";
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
                
                it("should only write the header once", function(done){
                    
                    var frame = output.frame("CONNECT", {
                       "accepted-version": "1.1",
                       "host": "example.com"
                    });
                    
                    frame.write("Chunk1");
                    
                    frame.write("Chunk2", function(error){
                        assert(!error);
                        var expected = "CONNECT\naccepted-version:1.1\nhost:example.com\n\nChunk1Chunk2";
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
                
                it("can write empty header frame", function(done){
                    
                    var frame = output.frame("CONNECT", {});
                    
                    frame.write("Body", function(error){
                        assert(!error);
                        var expected = "CONNECT\n\nBody";
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
            });
            
            it("should write frames in order", function(done){
                
                var firstFrame = output.frame("CONNECT", {});
                var secondFrame = output.frame("SEND", {});
                var thirdFrame = output.frame("SEND", {});
                
                thirdFrame.end("third", function(error){
                    assert(!error);
                    var expected = "CONNECT\n\nfirst\x00SEND\n\nsecond\x00SEND\n\nthird\x00";
                    assert(dest.toString().substring(0, expected.length) === expected);
                    done();
                });
                
                secondFrame.end("second");
                firstFrame.end("first");
            });
        });
    });
});
