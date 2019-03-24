/*jslint node: true, indent: 2, camelcase: true, esversion: 9 */

const IncomingFrameStream = require('../lib/IncomingFrameStream');
const BufferWritable = require('../lib/util/buffer/BufferWritable');
const NullWritable = require('../lib/util/NullWritable');
const net = require('net');
const crypto = require('crypto');
const assert = require('assert');

describe('IncomingFrameStream', function() {
    
    var stream;
    
    beforeEach(function() {
        stream = new IncomingFrameStream();
    });
    
    var readFrame = function(stream, callback) {
        
        var read = false;
        
        var onreadable = function() {
            if (!read) {
                var frame = stream.read();
                if (frame !== null) {
                    read = true;
                    stream.removeListener('readable', onreadable);
                    callback(null, frame);
                    
                }
            }
        };
        
        stream.on('readable', onreadable);
        
        onreadable();
    };
    
    var readFrameBody = function(stream, callback) {
        
        readFrame(stream, function(error, frame) {
            
            if (error) {
                callback(error);
                return;
            }
            
            var writable = new BufferWritable(Buffer.alloc(20));
            
            writable.on('finish', function() {
                callback(null, frame, writable.getWrittenSlice()); 
            });
            
            frame.pipe(writable);
        });
    };
    
    var writeBinaryFrame = function(writable, maxChunkSize, length, callback) {
        
        writable.write('MESSAGE\ncontent-length:' + length + '\n\n');
        
        var lengthRemaining = length;
        var md5sum = crypto.createHash('md5');
        
        var completed = false;
        
        var write = function() {
            
            var drained = true;
            
            while(lengthRemaining > 0 && drained) {
                var size = Math.min(lengthRemaining, maxChunkSize);
                var chunk = Buffer.alloc(size);
                md5sum.update(chunk);
                drained = writable.write(chunk);
                lengthRemaining -= size;
            }
            
            if (lengthRemaining === 0 && !completed) {
                writable.removeListener('drain', write);
                completed = true;
                writable.write('\x00');
                callback(length, md5sum.digest('hex'));
            }
        };
        
        writable.on('drain', write);
        
        write();
    };
    
    var createString = function(length) {
        
        var charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        
        var result = '';
        
        for (var i = 0; i < length; i++) {
            result += charset[Math.floor(Math.random() * charset.length)];
        }
        
        return result;
    };
    
    var writeTextFrame = function(writable, maxChunkSize, length, callback) {
        
        writable.write('MESSAGE\n\n');
        
        var lengthRemaining = length;
        var md5sum = crypto.createHash('md5');
        var completed = false;
        
        var write = function() {
            
            var drained = true;
            
            while(lengthRemaining > 0 && drained) {
                var size = Math.min(lengthRemaining, maxChunkSize);
                var chunk = createString(size);
                md5sum.update(chunk);
                drained = writable.write(chunk);
                lengthRemaining -= size;
            }
            
            if (lengthRemaining === 0 && !completed) {
                completed = false;
                writable.removeListener('drain', write);
                writable.write('\x00');
                callback(length, md5sum.digest('hex'));
            }
        };
        
        writable.on('drain', write);
        
        write();
    };
    
    describe('IncomingFrame', function() {
        
        it('should read variable-length bodies', function(done) {
            
            stream.write('CONNECT\n\nONE\x00\n\nCONNECT\n\nTWO\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                
                assert(!error);
                
                assert(body.length === 3);
                assert(body.toString() === 'ONE');
                
                readFrameBody(stream, function(error, frame, body) {
                    
                    assert(!error);
                    assert(body.length === 3);
                    assert(body.toString() === 'TWO');
                    
                    done();
                });
            });
        });
        
        it('should read fixed-length bodies', function(done) {
            
            stream.write('CONNECT\ncontent-length:4\n\n\x00\x00\x00\x00\x00CONNECT\ncontent-length:3\n\n\x00\n\n\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                
                assert(!error);
                assert(frame.headers['content-length'] === 4);
                assert(body[0] === 0 && body[1] === 0 && body[2] === 0 && body[3] === 0);
                
                readFrameBody(stream, function(error, frame, body) {
                    
                    assert(!error);
                    assert(frame.headers['content-length'] === 3);
                    assert(body[0] === 0 && body[1] === 10 && body[2] === 10);
                    
                    done();
                });
            });
        });
        
        it('should read empty frame', function(done) {
            
            stream.write('CONNECT\n\n\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                assert(!error);
                assert(body.length === 0);
                done();
            });
        });
        
        it('should decode v1.1 escaped characters', function(done) {
            
            stream.setVersion('1.1');
            
            stream.write('CONNECT\nheader1:\\ctest\nheader2:test\\n\nheader3:\\c\\n\\\\\n\n\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                
                assert(frame.headers.header1 === ':test');
                assert(frame.headers.header2 === 'test\n');
                assert(frame.headers.header3 === ':\n\\');
                
                assert(body.length === 0);
                
                done();
            });
        });
        
        it('should decode v1.2 escaped characters', function(done) {
            
            stream.setVersion('1.2');
            
            stream.write('CONNECT\nheader1:\\r\\n\n\n\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                assert(frame.headers.header1 === '\r\n');
                done();
            });
        });
        
        it('should not decode any escape characters in version 1.0', function(done) {
           
            stream.setVersion('1.0');
            
            stream.write('CONNECT\nheader1:\\ctest\\n:\n\n\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                assert(frame.headers.header1 === '\\ctest\\n:');
                done();
            });
        });
        
        it('should parse header line with multiple colons', function(done) {
            
            stream.write('CONNECT\nheader1::value:::value:\n\n\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                assert(frame.headers.header1 === ':value:::value:');
                done(); 
            });
        });
        
        it('should emit an error for an undefined escape sequence', function(done) {
            
            stream.setVersion('1.1');
            
            var processedStreamError = false;
            
            stream.on('error', function(error) {
                assert(error);
                processedStreamError = true;
                done();
            });
            
            stream.write('CONNECT\nheader:\\rtest\n\n\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                assert(error);
            });
        });
        
        it('should use the first occurring entry of a repeated header', function(done) {
            
            stream.write('CONNECT\ntest:1\ntest:2\n\n\x00');
            
            readFrameBody(stream, function(error, frame, body) {
                assert(frame.headers.test === '1');
                done();
            });
        });
        
        it('should parse CRLF as EOL', function(done) {
            
            stream.write('CONNECT\r\nheader1:value1\r\n\r\n\x00\r\n\r\nTEST\n\n\x00');
            
            readFrame(stream, function(error, frame) {
                
                assert(frame.command === 'CONNECT');
                assert(frame.headers.header1 === 'value1');
                
                frame.readEmptyBody(function(isEmpty) {
                    assert(isEmpty);
                    readFrame(stream, function(error, frame) {
                        frame.readEmptyBody(function(isEmpty) {
                            assert(isEmpty);
                            done(); 
                        });
                    });

                });
            });
        });
        
        describe('#readEmptyBody', function() {
            
            it('should read an empty body', function(done) {
                
                stream.write('CONNECT\n\n\x00');
                
                readFrame(stream, function(error, frame) {
                    frame.readEmptyBody(function(isEmpty) {
                        assert(isEmpty);
                        done();
                    });
                });
            });
            
            it('should not read a non-empty body', function(done) {
                
                stream.write('CONNECT\n\nBODY\x00');
                
                readFrame(stream, function(error, frame) {
                    frame.readEmptyBody(function(isEmpty) {
                        assert(!isEmpty);
                        done();
                    });
                });
            });
        });
        
        describe('#read', function() {
            
            it('should not emit error event for a valid frame', function(done) {
                
                stream.on('error', function() {
                    assert(false); 
                });
                
                stream.write('CONNECT\r\n\r\nBODY\x00');
                
                readFrameBody(stream, function(error, frame, body) {
                    done();
                });
            });
        });
        
        describe('#readString', function() {
            
            it('should read all data into a string', function(done) {
                
                stream.write('CONNECT\n\nBODY\x00');
                
                readFrame(stream, function(error, frame) {
                    frame.readString('utf-8', function(error, body) {
                        assert(!error);
                        assert(body === 'BODY');
                        done();
                    });
                });
            });

            it('should decode a multibyte character spread across multiple stream chunks', function(done) {

                stream.write('CONNECT\n\n');

                stream.write(Buffer.from([0xE2]));
                stream.write(Buffer.from([0x82]));
                stream.write(Buffer.from([0xAC, 0x00]));

                readFrame(stream, function(error, frame) {
                    frame.readString('utf-8', function(error, body) {
                        assert(!error);
                        assert(body.length === 1);
                        assert(body == '€');
                        done();
                    });
                });

            });
        });
    });
    
    
    it('should respond to back-pressure in the frame body stream', function(done) {
        
        stream = new IncomingFrameStream();
        
        assert(stream.write('MESSAGE\n\n') === false);
        // should choke the transport stream because IncomingFrame object has been 
        // pushed and is waiting to be read
        
        stream.once('drain', function() {
            
            assert(stream.write('1') === false);
            // should choke the stream because the sub-stream being read has
            // reached its high watermark
            
            stream.once('drain', function() {
                stream.write('two\x00');
            });
        });
        
        readFrame(stream, function(error, frame) {
            
            var writable = new NullWritable();
            
            writable.on('finish', function() {
                assert(writable.bytesWritten === 4);
                done();
            });
            
            frame.pipe(writable);
        });
    });
    
    it('should emit end event when the writable side of the stream ends', function(done) {
        
        stream.on('end', function() {
            done(); 
        });
        
        stream.end();
        stream.read();
    });
    
    it('should emit end event after a frame has been written and then the stream ended', function(done) {
        
        stream.on('end', function() {
            done(); 
        });
        
        stream.end('MESSAGE\n\nTESTING\x00');
        
        readFrameBody(stream, function(error, frame, body) {
            
            assert(!error);
            assert(body.toString() === 'TESTING');
            
            // Trigger the next read that causes EOF
            readFrame(stream, function(error, frame) {
                assert(error); 
            });
        });
    });
    
    it('should emit error event when the stream ends in the middle of parsing a frame', function(done) {
        
        stream.on('error', function(error) {
            assert(error.message === 'unexpected end of stream');
            done();
        });
        
        stream.on('end', function() {
           assert(false); 
        });
        
        stream.write('MESSAGE\n\nTESTIN');
        stream.end();
        
        readFrameBody(stream, function() {});
    });
    
    it('should read multiple large binary and text frames', function(done) {
        
        var port = 12345;
        
        var sentFrames = [];
        var receivedFrames = [];
        
        var server = net.createServer(function(connection) {
            
            writeBinaryFrame(connection, 4096, 327675, function(length, hash) {
                
                sentFrames.push([length, hash]);
                
                connection.write('\r\n\n\n');
                
                writeTextFrame(connection, 256, 1024, function(length, hash) {
                    
                    sentFrames.push([length, hash]);
                    
                    writeBinaryFrame(connection, 16635, 347798, function(length, hash) {
                        
                        sentFrames.push([length, hash]);
                        connection.end();
                    });
                });
            });
        });
        
        server.listen(port);
        
        var read = function(callback) {
            
            readFrame(stream, function(error, frame) {
                
                if (error) {
                    callback(error);
                    return;
                }
                
                var writable = new NullWritable('md5');
                
                frame.on('end', function() {
                    receivedFrames.push([writable.getBytesWritten(), writable.getHashDigest('hex')]);
                    callback(null);
                });
                
                frame.pipe(writable);
            });
        };
        
        var readLoop;
        readLoop = function() {
            read(function(error) {
                if (!error) {
                    readLoop();
                }
            });
        };
        
        var client = net.connect(port, function() {
            
            client.pipe(stream);
                    
            stream.on('end', function() {
                assert(sentFrames.length === receivedFrames.length);
                for (var i = 0; i < sentFrames.length; i++) {
                    assert.equal(receivedFrames[i][0], sentFrames[i][0]);
                    assert.equal(receivedFrames[i][1], sentFrames[i][1]);      
                }
                done();
            });
            
            readLoop();
        });
    
    });
    
    it('shoud emit an error event when the maximum length length is exceeded', function(done) {
        
        stream = new IncomingFrameStream({
            maxLineLength:2
        });
        
        stream.on('error', function() {
            done(); 
        });
        
        stream.write('MESSAGE\n\n');
    });
    
    it('should emit an error event when the maximum number of unique headers is exceeded', function(done) {
         
        stream = new IncomingFrameStream({
            maxHeaders: 2 
        });
        
        stream.on('error', function() {
            done(); 
        });
        
        stream.write('MESSAGE\nheader1:abc\nheader2:abc\nheader3:abc\n\n');
    });
});
