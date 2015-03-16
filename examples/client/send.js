var stompit = require('stompit');

var connectParams = {
    host: 'localhost',
    port: 61613,
    connectHeaders:{
        host: 'localhost',
        login: 'admin',
        passcode: 'password'
    }
};

stompit.connect(connectParams, function(error, client){
    
    if(error){
        console.log('Unable to connect: ' + error.message);
        return;
    }
    
    var sendParams = {
        'destination': '/queue/test',
        'content-type': 'application/json'
    };
    
    var frame = client.send(sendParams);
    
    frame.end(JSON.stringify({
        anything: 'anything',
        example: true
    }));
    
    client.disconnect(function(error){
        if(error){
            console.log('Error while disconnecting: ' + error.message);
            return;
        }
        console.log('Sent message');
    });
});
