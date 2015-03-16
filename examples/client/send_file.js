var stompit = require('stompit');

var fs = require('fs');
var path = require('path');

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
    
    var filename = path.dirname(module.filename) + '/data/input1.jpg';
    
    var fileStat = fs.statSync(filename);
    var contentLength = fileStat.size;
    
    var sendParams = {
        'destination': '/queue/test',
        'content-type': 'image/jpeg',
        'content-length': contentLength
    };
    
    var frame = client.send(sendParams);
    
    var file = fs.createReadStream(filename);
    file.pipe(frame);
    
    client.disconnect(function(error){
        if(error){
            console.log('Error while disconnecting: ' + error.message);
            return;
        }
        console.log('Sent file');
    });
});
