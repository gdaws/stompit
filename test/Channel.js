/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const { Channel, ConnectFailover } = require('../lib/index');
const MemorySocket = require('../lib/util/MemorySocket');
const BufferWritable = require('../lib/util/buffer/BufferWritable');
const BufferReadable = require('../lib/util/buffer/BufferReadable');
const NullWritable = require('../lib/util/NullWritable');
const Server = require('../lib/Server');
const assert = require('assert');

const createConnector = function(serverSocket) {
    return {
        connect: function(options, callback) {
            const socket = serverSocket.getPeerSocket();
            process.nextTick(callback);
            return socket;
        }
    };
};

describe('Channel', function() {
    
    var server1, server2, chan;
    
    beforeEach(function() {
        
        server1 = new Server(new MemorySocket());
        server2 = new Server(new MemorySocket());
        
        server1.on('error', function() {});
        server2.on('error', function() {});
        
        server1.on('connection', function() {
            
            server1.setCommandHandler('SEND', function() {
                server1.destroy();
            });
            
            server1.setCommandHandler('SUBSCRIBE', function() {
                server1.destroy(); 
            });
            
            server1.setCommandHandler('BEGIN', function() {
                server1.destroy(); 
            });
        });
        
        server1._disconnect = function(frame, beforeSendResponse){
            beforeSendResponse(null);
        };
        
        server2._disconnect = function(frame, beforeSendResponse){
            beforeSendResponse(null);
        };
        
        var connectFailover = new ConnectFailover([
            createConnector(server1.getTransportSocket()),
            createConnector(server2.getTransportSocket())
        ], {
            maxReconnects: 2,
            randomize: false
        });
        
        chan = new Channel(connectFailover);
    });
    
    describe('#send', function() {
        
        it('should send the message to the next server if the first server fails to accept the message', function(done) {
            
            var usedSecondServer = false;
            
            server2.on('connection', function() {
                server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                    
                    assert(frame.headers.destination === '/queue/test!');
                    
                    var writable = new BufferWritable(Buffer.alloc(26));
                    frame.on('end', function() {
                        assert(writable.getWrittenSlice().toString() === 'hello');
                        usedSecondServer = true;
                        beforeSendResponse();
                    });
                    
                    frame.pipe(writable);
                });
            });
            
            chan.send('/queue/test!', 'hello', function() {
                assert(usedSecondServer);
                done();
            });
        });
        
        it('should accept a function argument as the body', function(done) {
            
            server2.on('connection', function() {
                
                server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                    
                    assert(frame.headers.destination === '/queue/test!');
                    
                    var writable = new BufferWritable(Buffer.alloc(26));
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
                return new BufferReadable(Buffer.from('hello'));
            };
            
            chan.send('/queue/test!', createBody, function() {
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
                    var writable = new BufferWritable(Buffer.alloc(26));
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
            
            chan.send('/queue/test!', 'hello', function() {
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
                    var writable = new BufferWritable(Buffer.alloc(26));
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
            
            chan.send('/queue/test1', 'message1', function() {
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
            
            chan.subscribe('/queue/test', function(error, message) {
                
                if (error) {
                    return;
                }
                
                var writable = new BufferWritable(Buffer.alloc(26));
                
                message.on('end', function() {
                    
                    var str = writable.getWrittenSlice().toString();
                    if (str === 'message1') {
                        gotMessage1 = true;
                    }
                    else if (str === 'message2') {
                        gotMessage2 = true;
                    }
                    
                    chan.ack(message);
                    
                    if (gotMessage1 && gotMessage2) {
                        done();
                    }
                });
                
                message.pipe(writable);
            });
        });

        it('should return an object with a cancel method', function(done) {
            
            server2.on('connection', function() {
                
                var subscriptionId = null;
                
                server2.setCommandHandler('SUBSCRIBE', function(frame, beforeSendResponse) {
                    
                    subscriptionId = frame.headers.id;
                    
                    server2.readEmptyBody(frame, function() {
                        
                        beforeSendResponse();
                        
                        process.nextTick(function() {
                            server2.sendFrame('MESSAGE', {
                                'subscription': subscriptionId, 
                                'message-id': 1
                            }).end('message1');
                        });
                    });
                });
                
                server2.setCommandHandler('UNSUBSCRIBE', function(frame) {
                    assert(frame.headers.id === subscriptionId);
                    done();
                });
            });
            
            var subscription = chan.subscribe('/queue/test', function(error, message) {
                message.readString('utf8', function() {
                    subscription.cancel();
                });
            });
            
            assert(typeof subscription.cancel === 'function');
        });
    });
    
    describe('#begin', function() {
        
        it('should return a transaction object with send, commit and abort methods', function() {
            var transaction = chan.begin();
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
                        
                        server2.readEmptyBody(frame, function() {
                            
                            countBegins += 1;
                        
                            assert(countBegins === 1);
                            
                            server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                                countSends += 1;
                                var writable = new BufferWritable(Buffer.alloc(26));
                                frame.pipe(writable);
                                beforeSendResponse();
                            });
                            
                            server2.setCommandHandler('COMMIT', function(frame, beforeSendResponse) {
                                server2.readEmptyBody(frame, function() {
                                    assert(countSends === 3);
                                    gotCommit = true;
                                    beforeSendResponse();
                                });
                            });
                            
                            beforeSendResponse();
                        });
                    });
                });
                
                server2.on('end', function() {
                    closedConnection = true;
                    checkDone();
                });
                
                var transaction = chan.begin();
                
                transaction
                 .send('/queue/test/', 'message1')
                 .send('/queue/test/', Buffer.from('message2'))
                 .send('/queue/test/', function() {return new BufferReadable(Buffer.from('message3'));})
                 .commit(function() {
                    gotCallback = true;
                    checkDone();
                });
            });
        });
    });
    
    describe('idle event', function() {
        
        it('should emit when send has receipt', function(done) {
            
            var sendFinished = false;
            
            server2.on('connection', function() {
                server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                    frame.on('end', beforeSendResponse);
                    frame.pipe(new NullWritable());
                });
            });
            
            chan.on('idle', function() {
                assert(sendFinished);
                done();
            });
            
            chan.send('/queue/test', 'message1', function() {
                sendFinished = true;
            });
        });
        
        it('should emit after unlock', function(done) {
            
            chan.once('idle', function() {
                chan.once('idle', function() {
                    done();
                });
            });
            
            chan.lock();
            chan.unlock();
            
            chan.lock();
            chan.unlock();
        });
        
        it('should be blocked while the channel is locked', function(done) {
            
            var sendFinished = false;
            var locked = false;
            
            server2.on('connection', function() {
                server2.setCommandHandler('SEND', function(frame, beforeSendResponse) {
                    frame.on('end', beforeSendResponse);
                    frame.pipe(new NullWritable());
                });
            });
            
            chan.on('idle', function() {
                assert(sendFinished);
                assert(!locked);
                done();
            });
            
            chan.lock();
            
            chan.send('/queue/test', 'message1', function() {
                sendFinished = true;
                chan.unlock();
            });
        });
    });
});
