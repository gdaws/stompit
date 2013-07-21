
var FrameInputStream = require("../lib/frame_input_stream");
var BufferReadable = require("../lib/buffer_readable");
var BufferWritable = require("../lib/buffer_writable");

var assert = require("assert");
var stream = require("stream");

describe("FrameInputStream", function(){
    
    describe("#readFrame", function(){
        
        it("should read variable-length body frames", function(done){
            
            var readable = new BufferReadable(new Buffer("CONNECT\naccepted-version:1.1\nhost:example.com\n\nBODY\x00\n\n\n\n\n\nCONNECT\naccepted-version:1.1\nhost:example.com\n\nANOTHER BODY\x00"));
            
            var frameInputStream = new FrameInputStream(readable);
            
            frameInputStream.readFrame(function(frame){
                
                var buffer = new Buffer(20);
                var writable = new BufferWritable(buffer);
                
                frame.pipe(writable, {end: false});
                
                frame.on("end", function(){
                    
                    assert(writable.getBytesWritten() === 4);
                    assert(buffer.slice(0, 4).toString() === "BODY");
                    
                    frameInputStream.readFrame(function(frame){
                                
                        var buffer = new Buffer(20);
                        var writable = new BufferWritable(buffer);
                        
                        frame.pipe(writable, {end: false});
                        
                        frame.on("end", function(){
                            
                            assert(writable.getBytesWritten() === 12);
                            assert(buffer.slice(0, 12).toString() === "ANOTHER BODY");
                            
                            done();
                        });
                    });
                });
            });
        });
        
        it("should read fixed-length body frames", function(done){
            
            var readable = new BufferReadable(new Buffer("CONNECT\ncontent-length:4\n\n\x00\x00\x00\x00\x00CONNECT\ncontent-length:4\n\n\x00\n\n\n\x00"));
            var frameInputStream = new FrameInputStream(readable);
            
            frameInputStream.readFrame(function(frame){
               
                var buffer = new Buffer(20);
                var writable = new BufferWritable(buffer);
                
                frame.pipe(writable, {end: false});
                
                frame.on("end", function(){
                    
                    assert(writable.getBytesWritten() === 4);
                    assert(buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 0 && buffer[3] === 0);
                    
                    frameInputStream.readFrame(function(frame){
                        
                        var buffer = new Buffer(20);
                        var writable = new BufferWritable(buffer);
                        
                        frame.pipe(writable, {end: false});
                        
                        frame.on("end", function(){
                            
                            assert(writable.getBytesWritten() === 4);
                            assert(buffer.slice(0, 4).toString() === "\x00\n\n\n");
                            
                            done();
                        });
                    });
                });
            });
        });

        it("should read empty frame", function(done){
            
            var readable = new BufferReadable(new Buffer("CONNECT\n\n\x00"));
            var frameInputStream = new FrameInputStream(readable);
            
            frameInputStream.readFrame(function(frame){
                
                var buffer = new Buffer(20);
                var writable = new BufferWritable(buffer);
                
                frame.pipe(writable, {end: false});
                
                frame.on("end", function(){
                    
                    assert(writable.getBytesWritten() === 0);
                    
                    done();
                });
            });
        });
        
        it("should decode escaped characters", function(done){
             
            var readable = new BufferReadable(new Buffer("CONNECT\nheader1:\\ctest\nheader2:test\\n\nheader3:\\c\\n\\\\\n\n\x00"));
            var frameInputStream = new FrameInputStream(readable);
            
            frameInputStream.readFrame(function(frame){
                
                var buffer = new Buffer(20);
                var writable = new BufferWritable(buffer);
                
                frame.pipe(writable, {end: false});
                
                frame.on("end", function(){
                    
                    assert(frame.headers["header1"] === ":test");
                    assert(frame.headers["header2"] === "test\n");
                    assert(frame.headers["header3"] === ":\n\\");
                    
                    assert(writable.getBytesWritten() === 0);
                    
                    done();
                });
            });
            
        });
        
        it("should parse header line with multiple colons", function(done){
            
            var readable = new BufferReadable(new Buffer("CONNECT\nheader1::value:::value:\n\n\x00"));
            var frameInputStream = new FrameInputStream(readable);
            
            frameInputStream.readFrame(function(frame){
                assert(frame.headers["header1"] === ":value:::value:");
                done();
            });
        });
        
        it("should emit an error for an undefined escape sequence", function(done){
            
            var readable = new BufferReadable(new Buffer("CONNECT\nheader:\\rtest\n\n\x00"));
            var frameInputStream = new FrameInputStream(readable);
            
            frameInputStream.on("error", function(exception){
                assert(exception.message === "undefined escape sequence");
                done();
            });
            
            frameInputStream.readFrame(function(frame){
                
                var buffer = new Buffer(20);
                var writable = new BufferWritable(buffer);
                
                frame.pipe(writable, {end: false});
                
                frame.on("end", function(){
                    
                });
            });
        });
        
        it("should emit an error for an invalid content-length value", function(done){
            
            var readable = new BufferReadable(new Buffer("CONNECT\ncontent-length:sadf234\n\n\x00"));
            var frameInputStream = new FrameInputStream(readable);
            
            frameInputStream.on("error", function(exception){
                assert(exception.message === "invalid content-length");
                done();
            });
            
            frameInputStream.readFrame(function(frame){
                var buffer = new Buffer(20);
                var writable = new BufferWritable(buffer);
                frame.pipe(writable, {end: false});
                frame.on("end", function(){});
            });
        });
        
        it("should use the first occuring entry of a repeated header", function(done){
            
            var readable = new BufferReadable(new Buffer("CONNECT\ntest:1\ntest:2\n\n\x00"));
            var frameInputStream = new FrameInputStream(readable);
            
            frameInputStream.readFrame(function(frame){
                var buffer = new Buffer(20);
                var writable = new BufferWritable(buffer);
                frame.pipe(writable, {end: false});
                frame.on("end", function(){
                    assert(frame.headers["test"] === "1");
                    done();
                });
            });
        });
        
        describe("IncomingFrame", function(){
            
            describe("#readEmptyBody", function(){
                
                it("should read an empty body", function(done){
                    
                    var readable = new BufferReadable(new Buffer("CONNECT\n\n\x00"));
                    var frameInputStream = new FrameInputStream(readable);
                    
                    frameInputStream.readFrame(function(frame){
                        frame.readEmptyBody(function(isEmpty){
                            assert(isEmpty);
                            done();
                        });
                    });
                });
                
                it("should not read a non-empty body", function(done){
                    
                    var readable = new BufferReadable(new Buffer("CONNECT\n\nBODY\x00"));
                    var frameInputStream = new FrameInputStream(readable);
                    
                    frameInputStream.readFrame(function(frame){
                        frame.readEmptyBody(function(isEmpty){
                            assert(!isEmpty);
                            done();
                        });
                    });
                });
            });
        });
    });
});
