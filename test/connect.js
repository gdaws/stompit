var net = require("net");
var connect = require("../lib/connect");
var Client = require("../lib/client");
var Server = require("../lib/server");
var assert = require("assert");

var startServer = function(listener){
    var server = net.createServer(function(socket){
        var stomp = new Server(socket);
        listener(stomp);
    });
    server.listen(0);
    return server;
};

var startBrokenServer = function(){
    return startServer(function(stomp){
        stomp.on("error", function(){});
        stomp.destroy(new Error("unavailable"));
    });
};

describe("connect(options, [connectionListener])", function(){
    
    it("should connect to a stomp server", function(done){
        
        var serverCallback = false;
        var connectCallback = false;
        
        var server = startServer(function(stomp){
            stomp.on("connection", function(){
                serverCallback = true;
                if(serverCallback && connectCallback){
                    done();
                }
            });
        });
        
        connect({
            host: "127.0.0.1",
            port: server.address().port
        }, function(error, client){
            assert(!error);
            assert(client instanceof Client);
            connectCallback = true;
            if(serverCallback && connectCallback){
                done();
            }
        });
    });
    
    it("should include headers defined by the caller in the CONNECT frame", function(done){
        
        var server = startServer(function(stomp){
            stomp.on("connection", function(conn){
                assert(conn.headers.host === "test");
                assert(conn.headers.login === "a");
                assert(conn.headers.passcode === "b");
                assert(conn.headers.foo === "bar");
                done();
            });
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
    
    it("should callback on error", function(done){
       
        var server = startBrokenServer();
        
        connect({
            host:"127.0.0.1",
            port: server.address().port
        }, function(error){
            assert(error);
            done();
        });
    });
});

describe("connect(port, [host], [connectListener])", function(){
    it("should connect to a stomp server", function(done){
        
        var serverCallback = false;
        var connectCallback = false;
        
        var server = startServer(function(stomp){
            stomp.on("connection", function(){
                serverCallback = true;
                if(serverCallback && connectCallback){
                    done();
                }
            });
        });
        
        connect(server.address().port, function(error, client){
            assert(!error);
            assert(client instanceof Client);
            connectCallback = true;
            if(serverCallback && connectCallback){
                done();
            }
        });
    });
});

