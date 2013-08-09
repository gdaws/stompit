var net = require("net");
var connect = require("../lib/connect");
var Client = require("../lib/client");
var Server = require("../lib/server");
var assert = require("assert");

var startServer = function(listener){
    var server = net.createServer(function(socket){
        var stomp = new Server(socket);
        stomp.on("connection", listener);
    });
    server.listen(0);
    return server;
};

describe("connect(options, [connectionListener])", function(){
    
    it("should connect to a stomp server", function(done){
        
        var serverCallback = false;
        var connectCallback = false;
        
        var server = startServer(function(){
            serverCallback = true;
            if(serverCallback && connectCallback){
                done();
            }
        });
        
        connect({
            host: "127.0.0.1",
            port: server.address().port
        }, function(client){
            assert(client instanceof Client);
            connectCallback = true;
            if(serverCallback && connectCallback){
                done();
            }
        });
    });
    
    it("should include headers defined by the caller in the CONNECT frame", function(done){
        
        var server = startServer(function(conn){
            assert(conn.headers.host === "test");
            assert(conn.headers.login === "a");
            assert(conn.headers.passcode === "b");
            assert(conn.headers.foo === "bar");
            done();
        });
        
        connect({
            port: server.address().port,
            connectHeaders:{
                host: "test",
                login: "a",
                passcode: "b",
                foo: "bar"
            }
        });
    });
});

describe("connect(port, [host], [connectListener])", function(){
    it("should connect to a stomp server", function(done){
        
        var serverCallback = false;
        var connectCallback = false;
        
        var server = startServer(function(){
            serverCallback = true;
            if(serverCallback && connectCallback){
                done();
            }
        });
        
        connect(server.address().port, function(client){
            assert(client instanceof Client);
            connectCallback = true;
            if(serverCallback && connectCallback){
                done();
            }
        });
    });
});

