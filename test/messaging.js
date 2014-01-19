/*
 * Test stompit.Messaging
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var Messaging = require('../lib/messaging');
var MemorySocket = require('../lib/util/memory_socket');
var BufferWritable  = require('../lib/util/buffer/writable');
var BufferReadable  = require('../lib/util/buffer/readable');
var Client = require('../lib/client');
var Server = require('../lib/server');
var assert = require('assert');

var createConnector = function(serverSocket) {
    return {
        connect: function(options, callback) {
            var socket = serverSocket.getPeerSocket();
            process.nextTick(callback);
            return socket;
        }
    };
};

describe('Messaging', function() {
    
    var server1, server2, msging;
    
    beforeEach(function() {
        
        server1 = new Server(new MemorySocket());
        server2 = new Server(new MemorySocket());
        
        server1.on('error', function() {});
        
        server1.on('connection', function() {
            server1.setCommandHandler('SEND', function() {
                server1.sendError('unable to handle message').end();
            });
        });
        
        msging = new Messaging([
            createConnector(server1.getTransportSocket()),
            createConnector(server2.getTransportSocket())
        ], {
            randomize: false
        });
    });
    
    describe('#send', function() {
        
        it('should send the message to the next server if the first server fails to accept the message', function(done) {
            
            var usedSecondServer = false;
            
            server2.on('connection', function() {
                server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                    
                    assert(frame.headers.destination === '/queue/test!');
                    
                    var writable = new BufferWritable(new Buffer(26));
                    frame.on('end', function() {
                        assert(writable.getWrittenSlice().toString() === 'hello');
                        usedSecondServer = true;
                        beforeSendResponse();
                    });
                    
                    frame.pipe(writable);
                });
            });
            
            msging.send('/queue/test!', 'hello', function() {
                assert(usedSecondServer);
                done();
            });
        });
        
        it('should accept a function argument as the body', function(done) {
            
            server2.on('connection', function() {
                
                server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                    
                    assert(frame.headers.destination === '/queue/test!');
                    
                    var writable = new BufferWritable(new Buffer(26));
                    frame.on('end', function() {
                        assert(writable.getWrittenSlice().toString() === 'hello');
                        beforeSendResponse();
                    });
                    
                    frame.pipe(writable);
                });
            });
            
            var countCreateBody = 0;
            
            var createBody = function() {
                countCreateBody += 1;
                return new BufferReadable(new Buffer('hello'));
            };
            
            msging.send('/queue/test!', createBody, function() {
                assert(countCreateBody === 2);
                done();
            });
        });
        
        it('should close the connection once the operation is completed', function(done) {
            
            var sendCallback = false;
            var closedConnection = false;
            
            server2.on('connection', function() {
                server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                    assert(frame.headers.destination === '/queue/test!');
                    var writable = new BufferWritable(new Buffer(26));
                    frame.on('end', function() {
                        assert(writable.getWrittenSlice().toString() === 'hello');
                        beforeSendResponse();
                    });
                    frame.pipe(writable);
                });
            });
            
            server2.on('end', function() {
                closedConnection = true;
                if (sendCallback && closedConnection) {
                    done();
                }
            });
            
            msging.send('/queue/test!', 'hello', function() {
                sendCallback = true;
                if (sendCallback && closedConnection) {
                    done();
                }
            });
        });

        it('should return an object with fluent send interface for sending more messages on the same connection', function(done) {
            
            var gotMessage1 = false;
            var gotMessage2 = false;
            
            var callback1 = false;
            var callback2 = false;
            
            var closedConnection = false;
            
            var connections = 0;
            
            var checkDone = function() {
                if (gotMessage1 && gotMessage2 && callback1 && callback2 && closedConnection) {
                    done();
                }
            };
            
            server2.on('connection', function() {
                
                connections += 1;
                
                assert(connections < 2);
                
                server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                    var writable = new BufferWritable(new Buffer(26));
                    frame.on('end', function() {
                        
                        var str = writable.getWrittenSlice().toString();
                        
                        if (str === 'message1') {
                            gotMessage1 = true;
                        }
                        else if (str === 'message2') {
                            gotMessage2 = true;
                        }
                        
                        beforeSendResponse();
                    });
                    frame.pipe(writable);
                });
            });
            
            server2.on('end', function() {
                closedConnection = true;
                checkDone();
            });
            
            msging.send('/queue/test1', 'message1', function() {
                callback1 = true;
                checkDone();
            }).send('/queue/test2', 'message2', function() {
                callback2 = true;
                checkDone();
            });
        });
    });
    
    describe('#subscribe', function() {
        
        it('should receive messages', function(done) {
            
            var gotMessage1 = false;
            var gotMessage2 = false;
            
            server2.on('connection', function() {
                server2.setCommandHandler('SUBSCRIBE', function(frame, beforeSendResponse) {
                    var id = frame.headers.id;
                    beforeSendResponse();
                    process.nextTick(function() {
                        server2.sendFrame('MESSAGE', {'subscription':id, 'message-id': 1}).end('message1');
                        server2.sendFrame('MESSAGE', {'subscription':id, 'message-id': 2}).end('message2');
                    });
                });
            });
            
            msging.subscribe('/queue/test', function(error, message) {
                
                if (error) {
                    return;
                }
                
                var writable = new BufferWritable(new Buffer(26));
                
                message.on('end', function() {
                    
                    var str = writable.getWrittenSlice().toString();
                    if (str === 'message1') {
                        gotMessage1 = true;
                    }
                    else if (str === 'message2') {
                        gotMessage2 = true;
                    }
                    
                    message.ack();
                    
                    if (gotMessage1 && gotMessage2) {
                        done();
                    }
                });
                
                message.pipe(writable);
            });
        });

        it('should return an object with a cancel method', function(done) {
            
            server2.on('connection', function() {
                server2.setCommandHandler('SUBSCRIBE', function(frame, beforeSendResponse) {
                    var id = frame.headers.id;
                    beforeSendResponse();
                    process.nextTick(function() {
                        server2.sendFrame('MESSAGE', {'subscription':id, 'message-id': 1}).end('message1');
                    });
                });
            });
            
            server2.on('end', function() {
                done(); 
            });
            
            var subscription = msging.subscribe('/queue/test', function(error, message) {
                subscription.cancel();
            });
        });
    });
    
    describe('#begin', function() {
        
        it('should return a transaction object with send, commit and abort methods', function() {
            var transaction = msging.begin();
            assert(typeof transaction.send === 'function');
            assert(typeof transaction.commit === 'function');
            assert(typeof transaction.abort === 'function');
        });
        
        describe('Transaction', function() {
            
            it('should perform send and commit', function(done) {
                
                var gotCommit = false;
                var gotCallback = false;
                
                var countConnections = 0;
                var countBegins = 0;
                var countSends = 0;
                
                var closedConnection = false;
                
                var checkDone = function() {
                    if (gotCommit && gotCallback && closedConnection) {
                        done();
                    }
                };
                
                server2.on('connection', function() {
                    
                    countConnections += 1;
                    
                    assert(countConnections === 1);
                    
                    server2.setCommandHandler('BEGIN', function(frame, beforeSendResponse) {
                        
                        countBegins += 1;
                        
                        assert(countBegins === 1);
                        
                        server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                            countSends += 1;
                            var writable = new BufferWritable(new Buffer(26));
                            frame.pipe(writable);
                            beforeSendResponse();
                        });
                        
                        server2.setCommandHandler('COMMIT', function(frame, beforeSendResponse) {
                            assert(countSends === 3);
                            gotCommit = true;
                            beforeSendResponse();
                        });
                        
                        beforeSendResponse();
                    });
                });

                server2.on('end', function() {
                    closedConnection = true;
                    checkDone();
                });
                
                var transaction = msging.begin();
                
                transaction
                 .send('/queue/test/', 'message1')
                 .send('/queue/test/', new Buffer('message2'))
                 .send('/queue/test/', function() {return new BufferReadable(new Buffer('message3'));})
                 .commit(function() {
                    gotCallback = true;
                    checkDone();
                });
            });

            it('should perform abort', function(done) {
                
                var gotAbort = false;
                
                server2.on('connection', function() {
                    
                    server2.setCommandHandler('BEGIN', function(frame, beforeSendResponse) {
                        
                        server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                            var writable = new BufferWritable(new Buffer(26));
                            frame.pipe(writable);
                            beforeSendResponse();
                        });
                        
                        server2.setCommandHandler('ABORT', function(frame, beforeSendResponse) {
                            gotAbort = true;
                            beforeSendResponse();
                        });
                        
                        beforeSendResponse();
                    });
                });
                
                server2.on('end', function() {
                    assert(gotAbort === true);
                    done();
                });
                
                var transaction = msging.begin();
                
                transaction.send('/queue/test', 'message1').abort();
            });
        });
    });
});
