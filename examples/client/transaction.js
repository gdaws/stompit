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
    
    var transaction = client.begin();
    
    transaction.send({'destination': '/queue/test'}).end('first');
    transaction.send({'destination': '/queue/test'}).end('second');
    
    transaction.commit(); // or call transaction.abort()
    
    client.disconnect(function(error){
        if(error){
            console.log('Error while disconnecting: ' + error.message);
            return;
        }
        console.log('Sent messages');
    });
});
