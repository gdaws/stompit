var MemorySocket = require("../lib/memory_socket");
var Client = require("../lib/client");
var BufferWritable = require("../lib/buffer_writable");
var MessageBus = require("../lib/message_bus");
var assert = require("assert");

describe("MessageBusConnection", function(){
    
    var bus, publisher, consumer, publisherServerConnection, consumerServerConnection;
    
    beforeEach(function(done){
        
        bus = new MessageBus();
        
        var publisherConnected = false;
        var consumerConnected = false;
        
        var publisherSocket = new MemorySocket();
        publisherServerConnection = bus.addClient(publisherSocket);
        
        publisher = new Client(publisherSocket.getPeerSocket());
        
        publisher.connect({}, function(){
            publisherConnected = true;
            if(publisherConnected && consumerConnected){
                done();
            }
        });
        
        var consumerSocket = new MemorySocket();
        consumerServerConnection = bus.addClient(consumerSocket);
        
        consumer = new Client(consumerSocket.getPeerSocket());
        
        consumer.connect({}, function(){
            consumerConnected = true;
            if(publisherConnected && consumerConnected){
                done();
            }
        });
    });
    
    it("should deliver a message from publisher to consumer", function(done){
        
        consumer.subscribe({"destination":"/test", "ack":"client-individual"}, function(message){
            var buffer = new BufferWritable(new Buffer(100));
            message.on("end", function(){
                assert(buffer.getWrittenSlice().toString() === "hello");
                message.ack();
            });
            message.pipe(buffer);
        });
        
        publisher.send({"destination":"/test"}).end("hello");
        
        publisher.disconnect(function(){
            done();
        });
    });
    
    it("should synchronise the publisher and consumer", function(done){
        
        publisher.send({"destination":"/test"}).end("hello");
        
        publisher.disconnect(function(){
            done();
        });
        
        setTimeout(function(){
            consumer.subscribe({"destination":"/test", "ack":"client-individual"}, function(message){
                var buffer = new BufferWritable(new Buffer(100));
                message.on("end", function(){
                    assert(buffer.getWrittenSlice().toString() === "hello");
                    message.ack();
                });
                message.pipe(buffer);
            });
        }, 2);
    });
    
    it("should send an error to the publisher when the consumer nacks the message", function(done){
        
        consumer.subscribe({"destination":"/test", "ack":"client-individual"}, function(message){
            var buffer = new BufferWritable(new Buffer(100));
            message.on("end", function(){
                message.nack();
            });
            message.pipe(buffer);
        });
        
        publisher.send({"destination":"/test"}).end("hello");
        
        publisherServerConnection.on("error", function(){});
        
        publisher.on("error", function(){
            done();
        });
        
        publisher.disconnect(function(){
            assert(false);
        });
    });
    
    it("should send an error to the publisher when the consumer disconnects before sending ack", function(done){
        
        consumerServerConnection.on("error", function(){});
        publisherServerConnection.on("error", function(){});
        
        consumer.on("error", function(){});
        
        publisher.on("error", function(){
            done();
        });
        
        consumer.subscribe({"destination":"/test", "ack":"client-individual"}, function(message){
            consumer.destroy();
        });
        
        publisher.send({"destination":"/test"}).end("hello");
        
        publisher.disconnect(function(){
            assert(false);
        });
    });
});

