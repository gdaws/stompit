/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const { Client } = require('../lib/index');
const Server = require('../lib/Server');
const MemorySocket = require('../lib/util/MemorySocket');
const BufferWritable = require('../lib/util/buffer/BufferWritable');
const assert = require('assert');

const fail = function() {assert(false);};
const noop = function() {};

describe('Client', function() {
    
    var socket, client, server;
    
    beforeEach(function() {
        
        socket = new MemorySocket();
        
        server = new Server(socket);
        
        server._disconnect = function(frame, beforeSendResponse) {
            beforeSendResponse(null);
        };
        
        server.on('error', noop);
        
        client = new Client(socket.getPeerSocket());
        
        // User of client is expected to listen for error events
        client.on('error', noop);
    });
    
    describe('#connect', function() {
        
        it('should establish connection', function(done) {
            
            var serverConnected = false;
            var clientConnected = false;
            
            server.on('connection', function() {
                serverConnected = true;
            });
            
            client.on('connect', function() {
                clientConnected = true;
            });
            
            client.connect('localhost', function(error) {
                assert(!error);
                assert(serverConnected);
                assert(clientConnected);
                done();
            });
        });
        
        it('should callback on error', function(done) {
            client.connect({}, function(error) {
                assert(error);
                done();
            });
            server.destroy();
        });
        
        it('should send accept-version header', function(done) {
            
            server.on('connection', function(server) {
                assert(server.headers['accept-version'] === '1.0,1.1,1.2');
                done();
            });
                 
            client.connect({host:'localhost'});
        });
    });
    
    describe('#disconnect', function() {
        
        it('should disconnect', function(done) {
            client.connect('localhost', function() {
                client.disconnect(function(error) {
                    assert(!error);
                    done();
                });
            });
        });
        
        it('should request a receipt', function(done) {
            client.connect('localhost', function() {
                server._disconnect = function(frame, beforeSendResponse) {
                    beforeSendResponse();
                    assert(frame.headers.hasOwnProperty('receipt'));
                    done();
                };
                client.disconnect();
            });
        });
        
        it('should emit finish event before emitting end event', function(done) {
            client.connect('localhost', function() {
                
                var finished = false;
                var ended = false;
                
                // We are ending the connection
                client.on('finish', function() {
                    finished = true;
                    assert(!ended);
                });
                
                // The remote host has ended the connection
                client.on('end', function() {
                    
                    ended = true;
                    assert(finished);
                    done();
                });
                
                client.disconnect();
            });
        });
        
        it('should cause an error on sending any subsequent frame', function(done) {
            client.connect('localhost', function() {
                
                server._send = function() {};
                
                client.on('error', function(e) {
                    assert(e.message === 'cannot send frame on closed stream');
                    done();
                });
                
                client.disconnect();
                
                client.send().end();
            });
        });
        
        it('should callback on error', function(done) {
            
            client.disconnect(function(error) {
               assert(error);
               done(); 
            });
            
            server.destroy();
        });
    });
    
    describe('#readEmptyBody', function() {

        it('should callback after reading an empty body frame', function(done) {

            var frame = {
                readEmptyBody: function(callback) {
                    callback(true);
                }
            };

            client.readEmptyBody(frame, done);
        });


        it('should call destroy method after reading non-empty body frame', function(done) {

            var frame = {
                readEmptyBody: function(callback) {
                    callback(false);
                }
            };

            client.destroy = function(error) {
                assert(error.isProtocolError);
                assert(error.message === 'expected empty body frame');
                done();
            };

            client.readEmptyBody(frame);
        });

    });

    describe('#send', function() {
        
        it('should send a message', function(done) {
            
            server._send = function(frame, beforeSendResponse) {
                
                assert(frame.headers.destination === '/test');
                
                var writable = new BufferWritable(Buffer.alloc(26));
                
                frame.on('end', function() {
                    beforeSendResponse();
                    assert(writable.getWrittenSlice().toString() === 'abcdefgh');
                    done();
                });
                
                frame.pipe(writable);
            };
            
            client.connect('localhost', function() {
                var frame = client.send({destination: '/test'});
                frame.write('abcd');
                frame.end('efgh');
            });
        });
        
        it('should treat the first argument as the destination if it\'s a string value', function(done) {
            
            server._send = function(frame, beforeSendResponse) {
                assert(frame.headers.destination === '/test');
                var writable = new BufferWritable(Buffer.alloc(26));
                frame.on('end', function() {
                    beforeSendResponse();
                    done();
                });
                frame.pipe(writable);
            };
            
            client.connect('localhost', function() {
                var frame = client.send('/test');
                frame.write('abcd');
                frame.end('efgh');
            });
        });
    });

    describe('#sendString', function() {
        it('should send a message with the specified body', function(done) {
            server._send = function(frame, beforeSendResponse) {
                assert(frame.headers.destination === '/test');
                var writable = new BufferWritable(Buffer.alloc(26));
                frame.on('end', function() {
                    beforeSendResponse();
                    assert(writable.getWrittenSlice().toString() === 'abcdefgh');
                    done();
                });

                frame.pipe(writable);
            };

            client.connect('localhost', function() {
                client.sendString({destination: '/test'}, 'abcdefgh');
            });
        });

        it('should treat the second argument as the destination if it\'s a string value', function(done) {
            server._send = function(frame, beforeSendResponse) {
                assert(frame.headers.destination === '/test');
                var writable = new BufferWritable(Buffer.alloc(26));
                frame.on('end', function() {
                    beforeSendResponse();
                    done();
                });

                frame.pipe(writable);
            };

            client.connect('localhost', function() {
                client.sendString('/test', 'abcdefgh');
            });
        });

        it('should call the callback', function(done) {
            server._send = function(frame, beforeSendResponse) {
                var writable = new BufferWritable(Buffer.alloc(26));
                frame.on('end', function() {
                    beforeSendResponse();
                });
                frame.pipe(writable);
            };

            client.connect('localhost', function() {
                client.sendString({destination: '/test'}, 'abcdefgh', undefined, function() {
                  assert.ok(true);
                  done();
                });
            });
        });
    });

    describe('#destroy', function() {
        
        it('should emit an error event with the passed error argument', function(done) {
            client.once('error', function(exception) {
                assert(exception instanceof Error);
                assert(exception.message === 'test message');
                done();
            });
            client.destroy(new Error('test message'));
        });
        
        it('should call the destroy method on the transport socket', function(done) {
            
            var socket = client.getTransportSocket();
            socket.once('error', function() {});
            socket.once('close', function() {
                done();
            });
            
            client.once('error', function() {});
            
            client.destroy();
        });
        
        it('should not emit an error event if no error argument is passed', function(done) {
            client.on('error', function() {assert(false);});
            client.destroy();
            process.nextTick(function() {
                done();
            });
        });
        
    });
    
    describe('on receiving an unknown command', function() {
        it('should emit an error event', function(done) {
            
            client.once('error', function(exception) {
                assert(exception.isProtocolError());
                assert(exception.message === 'unknown command \'FOIDSUF\'');
                done();
            });
            
            server.sendFrame('FOIDSUF', {}).end();
        });
    });
    
    describe('on receiving an ERROR frame', function() {
       
        it('should emit an error event', function(done) {
            
            client.once('error', function(error) {
                assert(error.isProtocolError());
                done();
            });
            
            server.sendFrame('ERROR', {}).end();
        });
        
        it('should close the transport', function(done) {
            
            client.getTransportSocket().on('close', function() {
                done();    
            });
            
            client.once('error', function() {});
            
            server.sendFrame('ERROR', {}).end();
        });
    });
    
    describe('#subscribe', function() {
        
        it('should subscribe to a destination', function(done) {
                
            server._subscribe = function() {
                done();
            };
            
            server._unsubscribe = function() {assert(false);};
            
            client.connect('localhost', function() {
                client.subscribe({destination: '/test'}, function() {});
            });
        });
        
        it('should treat the first argument as the destination if it\'s a string value', function(done) {
            
            server._subscribe = function() {
                done();
            };
            
            server._unsubscribe = function() {assert(false);};
            
            client.connect('localhost', function() {
                client.subscribe('/test', function() {});
            });
        });
        
        it('should callback on message', function(done) {
            
            server._subscribe = function(frame, beforeSendResponse) {
                
                var id = frame.headers.id;
                
                beforeSendResponse();
                
                server.sendFrame('MESSAGE', {
                    'subscription': id,
                    'message-id': 1,
                    'destination': '/test',
                    'content-type': 'text/plain'
                }).end('hello');
            };
            
            server._ack = fail;
            server._nack = fail;
            server._unsubscribe = fail;
            
            client.connect('localhost', function() {
                var subscription = client.subscribe({destination: '/test'}, function(error, message) {
                    
                    assert(message.headers.subscription == subscription.getId());
                    assert(message.headers['message-id'] == '1');
                    
                    var writable = new BufferWritable(Buffer.alloc(26));
                    
                    message.on('end', function() {
                        
                        assert(writable.getWrittenSlice().toString() === 'hello');
                        
                        done();
                    });
                    
                    message.pipe(writable);
                });
            });
        });

        describe('Subscription', function() {
            
            it('should pass error to the message listener', function(done) {
                
                server._subscribe = function(frame, beforeSendResponse) {
                    beforeSendResponse();
                };
                
                server._unsubscribe = function(frame, beforeSendResponse) {
                    beforeSendResponse();
                };
                
                client.connect('localhost', function() {
                    
                    client.subscribe({destination: '/test'}, function(error) {
                        assert(error && error.message === 'testing');
                        done();
                    });
                    
                    client.destroy(new Error('testing'));
                });
            });
            
            describe('#unsubscribe', function() {
                
                it('should unsubscribe at the server', function(done) {
                    
                    server._subscribe = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                    };
                    
                    server._unsubscribe = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                        done();
                    };
                    
                    client.connect('localhost', function() {
                        var subscription = client.subscribe({destination: '/test'}, function() {});
                        subscription.unsubscribe();
                    });
                });
                
                it('should not pass error to the message listener after unsubscribe', function(done) {
                    
                    server._subscribe = function(frame, beforeSendResponse) {
                        
                        var id = frame.headers.id;
                        
                        beforeSendResponse();
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 1,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                    };
                    
                    server._unsubscribe = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                    };
                    
                    client.connect('localhost', function() {
                        
                        var subscription = client.subscribe({destination: '/test'}, function(error, message) {
                            
                            assert(!error);
                            assert(message);
                            
                            subscription.unsubscribe();
                            
                            process.nextTick(function() {
                                client.destroy(new Error('testing'));
                            });
                        });
                        
                        client.on('error', function() {
                            done();
                        });
                    });
                });

                it('should not dispatch the message listener after unsubscribe', function(done) {
                    
                    server._subscribe = function(frame, beforeSendResponse) {
                        
                        var id = frame.headers.id;
                        
                        beforeSendResponse();
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 1,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 2,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 3,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                    };
                    
                    server._ack = function(frame, beforeSendResponse) {
                        beforeSendResponse();  
                    };
                    
                    server._nack = function(frame, beforeSendResponse) {
                        beforeSendResponse();  
                    };
                    
                    server._unsubscribe = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                    };
                    
                    server._disconnect = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                    };
                    
                    client.connect('localhost', function() {
                        
                        var headers = {
                            destination: '/test', 
                            ack:'auto'
                        };
                        
                        var numMessages = 0;
                        
                        var subscription = client.subscribe(headers, function(error, message) {
                            
                            assert(!error);
                            assert(message);
                            
                            numMessages += 1;
                            
                            assert(numMessages === 1);
                            
                            message.readString('utf8', function(error) {
                                
                                assert(!error);
                                
                                subscription.unsubscribe();
                                
                                client.disconnect(function(error){
                                    assert(!error);
                                    done(); 
                                });
                            });
                        });
                    });
                });
                
                it('should not dispatch the message listener after disconnect on a non-auto subscription', function(done) {
                    
                    server._subscribe = function(frame, beforeSendResponse) {
                        
                        var id = frame.headers.id;
                        
                        beforeSendResponse();
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 1,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 2,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 3,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                    };
                    
                    server._ack = function(frame, beforeSendResponse) {
                        beforeSendResponse();  
                    };
                    
                    server._nack = function(frame, beforeSendResponse) {
                        beforeSendResponse();  
                    };
                    
                    server._unsubscribe = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                    };
                    
                    server._disconnect = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                    };
                    
                    client.connect('localhost', function() {
                        
                        var headers = {
                            destination: '/test', 
                            ack:'client-individual'
                        };
                        
                        var numMessages = 0;
                        
                        client.subscribe(headers, function(error, message) {
                            
                            assert(!error);
                            assert(message);
                            
                            numMessages += 1;
                            
                            assert(numMessages === 1);
                            
                            message.readString('utf8', function(error) {
                                
                                assert(!error);
                                
                                client.ack(message);
                                
                                client.disconnect(function(error){
                                    assert(!error);
                                    done(); 
                                });
                            });
                        });
                    });
                });
                
                it('should dispatch the message listener after disconnect on a auto subscription', function(done) {
                    
                    server._subscribe = function(frame, beforeSendResponse) {
                        
                        var id = frame.headers.id;
                        
                        beforeSendResponse();
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 1,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 2,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                        
                        server.sendFrame('MESSAGE', {
                            'subscription': id,
                            'message-id': 3,
                            'destination': '/test',
                            'content-type': 'text/plain'
                        }).end('hello');
                    };
                    
                    server._ack = function(frame, beforeSendResponse) {
                        beforeSendResponse();  
                    };
                    
                    server._nack = function(frame, beforeSendResponse) {
                        beforeSendResponse();  
                    };
                    
                    server._unsubscribe = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                    };
                    
                    server._disconnect = function(frame, beforeSendResponse) {
                        beforeSendResponse();
                    };
                    
                    client.connect('localhost', function() {
                        
                        var headers = {
                            destination: '/test', 
                            ack:'auto'
                        };
                        
                        var numMessages = 0;
                        
                        client.subscribe(headers, function(error, message) {
                            
                            assert(!error);
                            assert(message);
                            
                            numMessages += 1;
                            
                            message.readString('utf8', function(error) {
                                
                                assert(!error);
                                
                                if(numMessages === 1){
                                    client.disconnect(function(error){
                                        assert(!error);
                                        assert(numMessages === 3);
                                        done(); 
                                    });
                                }
                            });
                        });
                    });
                });
            });
        });
    });
    
    describe('#begin', function() {
        
        it('should send a BEGIN frame', function(done) {
            
            server._begin = function() {
                done();
            };
            
            server._commit = function() {};
            server._abort = function() {};
            
            client.connect('localhost', function() {
                client.begin();
            });
        });
        
        it('should allow a transaction-id argument', function(done) {
            
            server._begin = function(frame) {
                assert(frame.headers.transaction === 'myTransactionID');
                done();
            };
            
            server._commit = function() {};
            server._abort = function() {};
            
            client.connect('localhost', function() {
                client.begin('myTransactionID');
            });
        });
        
        it('should allow a header argument', function(done) {
            
            server._begin = function(frame) {
                assert(frame.headers.transaction === 'transaction_1');
                assert(frame.headers.test === '1');
                done();
            };
            
            server._commit = function() {};
            server._abort = function() {};
            
            client.connect('localhost', function() {
                client.begin({
                    transaction: 'transaction_1',
                    test: 1
                });
            });
        });
        
        it('should generate a transaction id if the transaction header is missing from the headers object', function(done) {
            
            server._begin = function(frame) {
                assert(frame.headers.transaction === '1');
                assert(frame.headers.test === '2');
                done();
            };
            
            server._commit = function() {};
            server._abort = function() {};
            
            client.connect('localhost', function() {
                client.begin({
                    test: 2
                });
            });
        });
        
        describe('Transaction', function() {
            
            var setupTransaction = function(callback) {
                client.connect('localhost', function() {
                    var transaction = client.begin();
                    callback(transaction);
                });
            };
            
            it('should be assigned a transaction id', function(done) {
                
                server._begin = function(frame, beforeSendResponse) {beforeSendResponse();};
                server._commit = function() {};
                server._abort = function() {};
                
                setupTransaction(function(transaction) {
                   assert(transaction.id === 1);
                   done();
                });
            });
            
            describe('#send', function() {
                it('should create a SEND frame with a transaction header', function(done) {
                    
                    server._begin = function(frame, beforeSendResponse) {beforeSendResponse();};
                    server._abort = function() {};
                    server._commit = function() {};
                    server._send = function(frame) {
                        assert(frame.headers.transaction === 1 || frame.headers.transaction === '1');
                        done();
                    };
                    
                    setupTransaction(function(transaction) {
                        var frame = transaction.send({destination:'/abc'});
                        assert(frame.command === 'SEND');
                        assert(frame.headers.transaction === 1 || frame.headers.transaction === '1');
                        frame.end();
                    });
                });
            });
            
            describe('#abort', function() {
                it('should send an ABORT frame with a transaction header', function(done) {
                    
                    server._begin = function(frame, beforeSendResponse) {beforeSendResponse();};
                    
                    server._abort = function(frame) {
                        assert(frame.headers.transaction === '1');
                        done();
                    };
                    
                    server._commit = function() {};
                    
                    setupTransaction(function(transaction) {
                        transaction.abort();
                    });
                });
            });
            
            describe('#commit', function() {
                it('should send a COMMIT frame with a transaction header', function(done) {
                    
                    server._begin = function(_frame, beforeSendResponse) {beforeSendResponse();};
                    server._abort = function() {};
                    
                    server._commit = function(frame) {
                        assert(frame.headers.transaction === '1');
                        done();
                    };
                    
                    setupTransaction(function(transaction) {
                        transaction.commit();
                    });
                });
            });
        });
    });

    it("should send and receive heart beats", function(done) {
        
        client.setHeartbeat([2, 2]);
        server.setHeartbeat([2, 2]);
        
        client.connect({}, function() {
            
            var socket = client.getTransportSocket();
            
            var bytesRead = socket.bytesRead;
            var bytesWritten = socket.bytesWritten;
            
            setTimeout(function() {
                assert(socket.bytesRead > bytesRead);
                assert(socket.bytesWritten > bytesWritten);
                done();
            }, 10);
        });
    });

    it('should send heart beats only', function(done) {
        
        server.setHeartbeat([0, 2]);

        client.connect({'heart-beat': '2,0'}, function() {
            
            var socket = client.getTransportSocket();
            
            var bytesRead = socket.bytesRead;
            var bytesWritten = socket.bytesWritten;
            
            setTimeout(function() {
                assert(socket.bytesRead == bytesRead);
                assert(socket.bytesWritten > bytesWritten);
                done();
            }, 10);
        });
    });

    it ('should receive heart beats only', function(done) {

        server.setHeartbeat([2, 0]);

        client.connect({'heart-beat': '0,2'}, function() {
            
            var socket = client.getTransportSocket();
            
            var bytesRead = socket.bytesRead;
            var bytesWritten = socket.bytesWritten;
            
            setTimeout(function() {
                assert(socket.bytesRead > bytesRead);
                assert(socket.bytesWritten == bytesWritten);
                done();
            }, 10);
        });
    });

    it ('client should disable heart beating', function(done) {

        server.setHeartbeat([2, 2]);

        client.connect({'heart-beat': '0,0'}, function() {
            
            var socket = client.getTransportSocket();
            
            var bytesRead = socket.bytesRead;
            var bytesWritten = socket.bytesWritten;
            
            setTimeout(function() {
                assert(socket.bytesRead == bytesRead);
                assert(socket.bytesWritten == bytesWritten);
                done();
            }, 10);
        });
    });


    it ('server should disable heart beating', function(done) {

        server.setHeartbeat([0, 0]);

        client.connect({'heart-beat': '2,2'}, function() {
            
            var socket = client.getTransportSocket();
            
            var bytesRead = socket.bytesRead;
            var bytesWritten = socket.bytesWritten;
            
            setTimeout(function() {
                assert(socket.bytesRead == bytesRead);
                assert(socket.bytesWritten == bytesWritten);
                done();
            }, 10);
        });
    });
});
