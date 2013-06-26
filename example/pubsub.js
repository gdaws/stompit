var stompit = require("stompit");

var headers = {
    "host": "/"
};

var socket = stompit.connect({connectHeaders: headers}, function(){
    
    var queueName = "/queue/pubsub-example";
    
    socket.subscribe({destination: queueName}, function(message){
        
        console.log("Receiving message " + message.headers["message-id"]);
        
        message.once("end", function(){
            
            console.log("\nEnd of message");
            
            message.ack();
            
            socket.disconnect();
        });
        
        message.pipe(process.stdout);
    });
    
    socket.send({destination: queueName}).end("HELLO");
});
