var MemorySocket = require("../lib/memory_socket");
var Client = require("../lib/client");
var Server = require("../lib/server");
var BufferWritable = require("../lib/buffer_writable");
var assert = require("assert");

var fail = function(){assert(false);};

describe("Server", function(){
    
    var socket, client, server;
    
    beforeEach(function(){
        
        socket = new MemorySocket();
        
        server = new Server(socket);
        client = new Client(socket.getPeerSocket());
    });
    
    describe("on receiving unknown command", function(){
        it("should send an error frame", function(done){
            
            client.setCommandHandler("ERROR", function(frame){
                done();
            });
            
            client.sendFrame("SDLFIJ", {}).end();
        });
    });
});
