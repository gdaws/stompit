/*jslint node: true, indent: 2, camelcase: true, esversion: 9 */

const OutgoingFrameStream = require('../lib/OutgoingFrameStream');
const BufferWritable = require('../lib/util/buffer/BufferWritable');
const stream = require('stream');
const assert = require('assert');

describe('OutgoingFrameStream', function(){
    
    var dest;
    var writable;
    var output;
    
    beforeEach(function(){
        dest = Buffer.alloc(256);
        writable = new BufferWritable(dest);
        output = new OutgoingFrameStream(writable);
        output.setVersion('1.1');
    });
    
    describe('#frame', function(){
        
        it('should return a stream.Writable object', function(){
            assert(output.frame('CONNECT') instanceof stream.Writable);
        });
        
        describe('OutgoingFrame', function(){
            
            describe('#end', function(){
                
                it('should value-encode command and headers', function(done){
                    
                    var frame = output.frame('\n:\\', {
                        '\n:\\': '\n\n::\\\\'
                    });
                    
                    frame.end(function(){
                        assert(writable.getWrittenSlice().toString() === '\\n\\c\\\\\n\\n\\c\\\\:\\n\\n\\c\\c\\\\\\\\\n\n\x00\n');
                        done();
                    });
                });
                
                it('should ignore null properties in the headers hash', function(done){
                    
                    var frame = output.frame('CONNECT', {
                        'accepted-version': '1.1',
                        'host': null
                    });
                    
                    frame.end(function(){
                        assert(writable.getWrittenSlice().toString() === 'CONNECT\naccepted-version:1.1\n\n\x00\n');
                        done();
                    });
                });
                
                it('should write empty body frame', function(done){
                    
                    var frame = output.frame('CONNECT', {
                        'accepted-version': '1.1',
                        'host': 'example.com'
                    });
                    
                    frame.end(function(error){
                        assert(!error);
                        var expected = 'CONNECT\naccepted-version:1.1\nhost:example.com\n\n\x00';
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
                
                it('should write non-empty body frame', function(done){
                   
                   var frame = output.frame('CONNECT', {
                        'accepted-version': '1.1',
                        'host': 'example.com'
                    });
                    
                    frame.end('Body', function(error){
                        assert(!error);
                        var expected = 'CONNECT\naccepted-version:1.1\nhost:example.com\n\nBody\x00\n';
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
                
                it('should prevent any future writes', function(done){
                    
                    var frame = output.frame('CONNECT', {
                        'accepted-version': '1.1',
                        'host': 'example.com'
                    });
                    
                    frame.end('Body', function(error){
                        process.nextTick(function(){
                            
                            frame.on('error', function(){
                                done();
                            });
                            
                            frame.write('More');
                        });
                    });
                });
            });
            
            describe('#write', function(){
                
                it('should write header and body before #end is called', function(done){
                    
                    var frame = output.frame('CONNECT', {
                       'accepted-version': '1.1',
                       'host': 'example.com'
                    });
                    
                    frame.write('Body', function(error){
                        assert(!error);
                        var expected = 'CONNECT\naccepted-version:1.1\nhost:example.com\n\nBody';
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
                
                it('should only write the header once', function(done){
                    
                    var frame = output.frame('CONNECT', {
                       'accepted-version': '1.1',
                       'host': 'example.com'
                    });
                    
                    frame.write('Chunk1');
                    
                    frame.write('Chunk2', function(error){
                        assert(!error);
                        var expected = 'CONNECT\naccepted-version:1.1\nhost:example.com\n\nChunk1Chunk2';
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
                
                it('can write empty header frame', function(done){
                    
                    var frame = output.frame('CONNECT', {});
                    
                    frame.write('Body', function(error){
                        assert(!error);
                        var expected = 'CONNECT\n\nBody';
                        assert(dest.toString().substring(0, expected.length) === expected);
                        done();
                    });
                });
            });
            
            it('should write frames in order', function(done){
                
                var firstFrame = output.frame('CONNECT', {});
                var secondFrame = output.frame('SEND', {});
                var thirdFrame = output.frame('SEND', {});
                
                thirdFrame.end('third', function(error){
                    assert(!error);
                    var expected = 'CONNECT\n\nfirst\x00\nSEND\n\nsecond\x00\nSEND\n\nthird\x00\n';
                    assert(dest.toString().substring(0, expected.length) === expected);
                    done();
                });
                
                secondFrame.end('second');
                firstFrame.end('first');
            });
        });
    });
    
    describe('#heartbeat', function(){
        it('should write a newline byte', function(done){
            output.heartbeat();
            assert(writable.getBytesWritten() === 1);
            assert(dest[0] === '\n'.charCodeAt(0));
            done();
        });
    });
});
