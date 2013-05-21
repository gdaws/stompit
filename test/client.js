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
            };
            
            var acks = [];
            
            server._ack = function(frame, beforeSendResponse){
                
                acks.push(frame.headers["message-id"]);
                
                beforeSendResponse();
                
                switch(acks.length){
                    case 1:
                        assert(acks[0] == "b");
                        break;
                    case 2:
                        assert(acks[1] == "c");
                        done();
                        break;
                    default: assert(false);
                }
            };
            
            server._nack = fail;
            server._unsubscribe = fail;
            
            client.connect("localhost", function(){
                
                var messages = [];
                
                var subscription = client.subscribe({destination: "/test", ack: "client"}, function(message){
                    
                    messages.push(message);
                    
                    var writable = new BufferWritable(new Buffer(26));
                    
                    message.on("end", function(){
                        if(messages.length == 2){
                            messages[1].ack();
                            messages[0].ack();
                        }
                        else if(messages.length == 3){
                            messages[2].ack();
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
                
                var subscription = client.subscribe({destination: "/test", ack: "client"}, function(message){
                    
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
});
