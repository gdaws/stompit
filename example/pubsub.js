var stompit = require("stompit");

var broker = stompit.broker([
    {host: "localhost", port: 61613}
]);

broker.send("/queue/pubsub-example", "SUCCESS!\n");

var subscription = broker.subscribe("/queue/pubsub-example", function(error, message){
    
    if(error){
        console.log("failed to subscribe");
        return;
    }
    
    message.once("end", function(){
        message.ack();
        subscription.cancel();
    });
    
    message.pipe(process.stdout);
});
