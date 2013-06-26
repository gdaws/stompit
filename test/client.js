var MemorySocket = require("../lib/memory_socket");
var Client = require("../lib/client");
var Server = require("../lib/server");
var BufferWritable = require("../lib/buffer_writable");
var assert = require("assert");

var fail = function(){assert(false);};

describe("Client", function(){
    
    var socket, client, server;
    
    beforeEach(function(){
        
        socket = new MemorySocket();
        
        server = new Server(socket);
        
        server._disconnect = function(frame, beforeSendResponse){
            beforeSendResponse(null);
        };
        
        client = new Client(socket.getPeerSocket());
    });
    
    describe("#connect", function(){
        
        it("should establish connection", function(done){
            
            var serverConnected = false;
            var clientConnected = false;
            
            server.on("connection", function(){
                serverConnected = true;
            });
            
            client.on("connect", function(){
                clientConnected = true;
            });
            
            client.connect("localhost", function(){
                assert(serverConnected);
                assert(clientConnected);
                done();
            });
        });
    });
    
    describe("#disconnect", function(){
        
        it("should disconnect", function(done){
            client.connect("localhost", function(){
                client.disconnect(function(){
                    done();
                });
            });
        });
        
        it("should request a receipt", function(done){
            client.connect("localhost", function(){
                server._disconnect = function(frame, beforeSendResponse){
                    beforeSendResponse();
                    assert(frame.headers.hasOwnProperty("receipt"));
                    done();
                };
                client.disconnect();
            });
        });
        
        it("should emit finish event before emitting end event", function(done){
            client.connect("localhost", function(){
                
                var finished = false;
                var ended = false;
                
                // We are ending the connection
                client.on("finish", function(){
                    finished = true;
                    assert(!ended);
                });
                
                // The remote host has ended the connection
                client.on("end", function(){
                    ended = true;
                    assert(finished);
                    done();
                });
                
                client.disconnect();
            });
        });
    });
    
    describe("#send", function(){
        
        it("should send a message", function(done){
            
            server._send = function(frame, beforeSendResponse){
                
                assert(frame.headers["destination"] === "/test");
                
                var writable = new BufferWritable(new Buffer(26));
                
                frame.on("end", function(){
                    beforeSendResponse();
                    assert(writable.getWrittenSlice().toString() === "abcdefgh");
                    done();
                });
                
                frame.pipe(writable);
            };
            
            client.connect("localhost", function(){
                var frame = client.send({destination: "/test"});
                frame.write("abcd");
                frame.end("efgh");
            });
        });
    });
    
    describe("#destroy", function(){
        
        it("should emit an error event with the passed error argument", function(done){
            client.once("error", function(exception){
                assert(exception instanceof Error);
                assert(exception.message === "test message");
                done();
            });
            client.destroy(new Error("test message"));
        });
        
        it("should call the destroy method on the transport socket", function(done){
            
            var socket = client.getTransportSocket();
            socket.once("error", function(){});
            socket.once("close", function(){
                done();
            });
            
            client.once("error", function(){});
            
            client.destroy();
        });
        
        it("should not emit an error event if no error argument is passed", function(done){
            client.on("error", function(){assert(false);});
            client.destroy();
            process.nextTick(function(){
                done();
            });
        });
        
    });
    
    describe("on receiving an unknown command", function(){
        it("should emit an error event", function(done){
            
            client.once("error", function(exception){
                assert(exception.message === "Protocol error: unknown command 'FOIDSUF'");
                done();
            });
            
            server.sendFrame("FOIDSUF", {}).end();
        });
    });
    
    describe("on receiving an ERROR frame", function(){
       
        it("should emit an error event", function(done){
            
            client.once("error", function(){
                done();
            });
            
            server.sendFrame("ERROR", {}).end();
        });
        
        it("should close the transport", function(done){
            
            client.getTransportSocket().on("close", function(){
                done();    
            });
            
            client.once("error", function(){});
            
            server.sendFrame("ERROR", {}).end();
        });
    });
    
    describe("#subscribe", function(){
        
        it("should subscribe to a destination", function(done){
                
            server._subscribe = function(frame, beforeSendResponse){
                done();
            };
            
            server._unsubscribe = function(){assert(false);};
            
            client.connect("localhost", function(){
                client.subscribe({destination: "/test"}, function(){});
            });
        });
        
        it("should callback on message", function(done){
            
            server._subscribe = function(frame, beforeSendResponse){
                
                var id = frame.headers["id"];
                
                beforeSendResponse();
                
                server.sendFrame("MESSAGE", {
                    "subscription": id,
                    "message-id": 1,
                    "destination": "/test",
                    "content-type": "text/plain"
                }).end("hello");
            };
            
            server._ack = fail;
            server._nack = fail;
            server._unsubscribe = fail;
            
            client.connect("localhost", function(){
                var subscription = client.subscribe({destination: "/test"}, function(message){
                    
                    assert(message.headers["subscription"] == subscription.getId());
                    assert(message.headers["message-id"] == "1");
                    
                    var writable = new BufferWritable(new Buffer(26));
                    
                    message.on("end", function(){
                        
                        message.ack();
                        
                        assert(writable.getWrittenSlice().toString() === "hello");
                        
                        done();
                    });
                    
                    message.pipe(writable);
                });
            });
        });
        
        it("should send one ACK for multiple messages in client ack mode", function(done){
            
            server._subscribe = function(frame, beforeSendResponse){
                
                var id = frame.headers["id"];
                
                beforeSendResponse();
                
                server.sendFrame("MESSAGE", {
                    "subscription": id,
                    "message-id": "a",
                    "destination": "/test",
                    "content-type": "text/plain"
                }).end("hello");
                
                server.sendFrame("MESSAGE", {
                    "subscription": id,
                    "message-id": "b",
                    "destination": "/test",
                    "content-type": "text/plain"
                }).end("hello");
                
                server.sendFrame("MESSAGE", {
                    "subscription": id,
                    "message-id": "c",
                    "destination": "/test",
                    "content-type": "text/plain"
                }).end("hello");
                
                server.sendFrame("MESSAGE", {
                    "subscription": id,
                    "message-id": "d",
                    "destination": "/test",
                    "content-type": "text/plain"
                }).end("hello");
                
                server.sendFrame("MESSAGE", {
                    "subscription": id,
                    "message-id": "e",
                    "destination": "/test",
                    "content-type": "text/plain"
                }).end("hello");
            };
            
            var acks = [];
            
            server._ack = function(frame, beforeSendResponse){
                
                acks.push(frame.headers["message-id"]);
                
                beforeSendResponse();
                
                switch(acks.length){
                    case 1:
                        assert(acks[0] == "b");
                        break;
                    case 3:
                        assert(acks[2] == "e");
                        done();
                        break;
                    default: assert(false);
                }
            };
            
            server._nack = function(frame, beforeSendResponse){
                
                acks.push(frame.headers["message-id"]);
                
                beforeSendResponse();
                
                switch(acks.length){
                    case 2:
                        assert(acks[1] == "c");
                        break;
                    default: assert(false);
                }
            };
            
            server._unsubscribe = fail;
            
            client.connect("localhost", function(){
                
                var messages = [];
                
                client.subscribe({destination: "/test", ack: "client"}, function(message){
                    
                    messages.push(message);
                    
                    var writable = new BufferWritable(new Buffer(26));
                    
                    message.on("end", function(){
                        
                        switch(messages.length){
                            case 2:
                                messages[1].ack();
                                messages[0].ack();
                                // Ack for a and b
                                break;
                            case 5:
                                messages[4].ack();
                                messages[2].nack();
                                // Nack for c
                                messages[3].ack();
                                // Ack for d and e
                                break;
                        }
                    });
                    
                    message.pipe(writable);
                });
            });
        });

        it("should send one ACK for each message in client-individual ack mode", function(done){
            
            server._subscribe = function(frame, beforeSendResponse){
                
                var id = frame.headers["id"];
                
                beforeSendResponse();
                
                server.sendFrame("MESSAGE", {
                    "subscription": id,
                    "message-id": 1,
                    "destination": "/test",
                    "content-type": "text/plain"
                }).end("hello");
                
                server.sendFrame("MESSAGE", {
                    "subscription": id,
                    "message-id": 2,
                    "destination": "/test",
                    "content-type": "text/plain"
                }).end("hello");
            };
            
            var acks = [];
            
            server._ack = function(frame, beforeSendResponse){
                
                acks.push(frame.headers["message-id"]);
                
                beforeSendResponse();
                
                switch(acks.length){
                    case 1:
                        assert(acks[0] == 1);
                        break;
                    case 2:
                        assert(acks[1] == 2);
                        done();
                        break;
                    default: assert(false);
                }
            };
            
            server._nack = fail;
            server._unsubscribe = fail;
            
            client.connect("localhost", function(){
                
                client.subscribe({destination: "/test", ack: "client-individual"}, function(message){
                    
                    var writable = new BufferWritable(new Buffer(26));
                    
                    message.on("end", function(){
                        message.ack();
                    });
                    
                    message.pipe(writable);
                });
            });
        });
        
        describe("Subscription", function(){
            describe("#unsubscribe", function(){
                it("should unsubscribe at the server", function(done){
                    
                    server._subscribe = function(frame, beforeSendResponse){
                        beforeSendResponse();
                    };
                    
                    server._unsubscribe = function(frame, beforeSendResponse){
                        beforeSendResponse();
                        done();
                    };
                    
                    client.connect("localhost", function(){
                        var subscription = client.subscribe({destination: "/test"}, function(){});
                        subscription.unsubscribe();
                    });
                });
            });
        });
    });

    describe("#begin", function(){
        
        it("should send a BEGIN frame", function(done){
            
            server._begin = function(frame, beforeSendResponse){
                done();
            };
            
            server._commit = function(){};
            server._abort = function(){};
            
            client.connect("localhost", function(){
                client.begin();
            });
        });
        
        describe("Transaction", function(){
            
            var setupTransaction = function(callback){
                client.connect("localhost", function(){
                    var transaction = client.begin();
                    callback(transaction);
                });
            };
            
            it("should be assigned a transaction id", function(done){
                
                server._begin = function(frame, beforeSendResponse){beforeSendResponse();};
                server._commit = function(){};
                server._abort = function(){};
                
                setupTransaction(function(transaction){
                   assert(transaction.id === 1);
                   done();
                });
            });
            
            describe("#send", function(){
                it("should create a SEND frame with a transaction header", function(done){
                    
                    server._begin = function(frame, beforeSendResponse){beforeSendResponse();};
                    server._abort = function(){};
                    server._commit = function(){};
                    server._send = function(frame){
                        assert(frame.headers["transaction"] === 1 || frame.headers["transaction"] === "1");
                        done();
                    };
                    
                    setupTransaction(function(transaction){
                        var frame = transaction.send({destination:"/abc"});
                        assert(frame.command === "SEND");
                        assert(frame.headers["transaction"] === 1 || frame.headers["transaction"] === "1");
                        frame.end();
                    });
                });
            });
            
            describe("#abort", function(){
                it("should send an ABORT frame with a transaction header", function(done){
                    
                    server._begin = function(frame, beforeSendResponse){beforeSendResponse();};
                    
                    server._abort = function(frame){
                        assert(frame.headers["transaction"] === "1");
                        done();
                    };
                    
                    server._commit = function(){};
                    
                    setupTransaction(function(transaction){
                        transaction.abort();
                    });
                });
            });
            
            describe("#commit", function(){
                it("should send a COMMIT frame with a transaction header", function(done){
                    
                    server._begin = function(frame, beforeSendResponse){beforeSendResponse();};
                    server._abort = function(frame){};
                    
                    server._commit = function(frame){
                        assert(frame.headers["transaction"] === "1");
                        done();
                    };
                    
                    setupTransaction(function(transaction){
                        transaction.commit();
                    });
                });
            });
        });
    });
});
