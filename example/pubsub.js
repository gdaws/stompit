var net = require("net");
var Client = require("../lib/client");

var log = console.log;

var socket = net.connect({port: 61613, allowHalfOpen: true}, function(){
    
    log("Established TCP connection on port " + socket.remotePort);
    
    socket.once("close", function(){
       log("Closed TCP connection");
    });
    
    var client = new Client(socket);
    
    client.on("error", function(exception){
        log(exception.message);
    });
    
    client.on("end", function(){
       log("Ended session");
    });
    
    client.connect(null, function(){
        
        log("Established STOMP session");
        
        var dst = "/queue/pubsub-example";
        
        client.subscribe({destination: dst, ack: "client"}, function(message){
            
            log("Receiving message " + message.headers["message-id"]);
            
            message.once("end", function(){
                log("\nEnd of message");
                message.ack();
                client.disconnect();
            });
            
            message.pipe(process.stdout);
        });
        
        client.send({destination: dst}).end("HELLO");
    });
});
