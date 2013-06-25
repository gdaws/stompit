var net = require("net");
var Client = require("./client");
var util = require("./util");

function connect(){
    
    var args = net._normalizeConnectArgs(arguments); 
    
    var options = util.extend({
        host: "localhost",
        connectHeaders: {}
    }, args[0]);
    
    if(options.port === undefined){
        options.port = 61613;
    }
    
    var cb = args[1];
    
    var client, socket, errorBeforeConnectListener;
    
    var onConnected = function(){
        
        socket.removeListener("error", errorBeforeConnectListener);
        
        client.connect(util.extend({host: options.host}, options.connectHeaders), cb);
    };
    
    socket = net.connect.apply(null, [options, onConnected]);
    
    client = new Client(socket, options);
    
    errorBeforeConnectListener = function(e){
        client.emit(e);
    };
    
    socket.on("error", errorBeforeConnectListener);
    
    return client;
}

module.exports = {
    connect: connect
};
