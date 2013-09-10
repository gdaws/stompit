/*
 * Test stompit.connect
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var net         = require('net');
var tls         = require('tls');
var fs          = require('fs');
var path        = require('path');
var connect     = require('../lib/connect');
var Client      = require('../lib/client');
var Server      = require('../lib/server');
var assert      = require('assert');

var startServer = function(listener){
    var server = net.createServer(function(socket){
        var stomp = new Server(socket);
        listener(stomp);
    });
    server.listen(0);
    return server;
};

var readFile = function(filename){
    if(filename[0] !== '/'){
        filename = path.dirname(module.filename) + path.sep + filename;
    }
    return fs.readFileSync(filename);
};

var startSecureServer = function(listener){
    var server = tls.createServer({
        ca:   [readFile('fixtures/ca.crt')],
        cert: readFile('fixtures/server.crt'),
        key:  readFile('fixtures/server.key'),
        requestCert: false
    }, function(socket){
        var stomp = new Server(socket);
        listener(stomp);
    });
    server.listen(0);
    return server;
};

var startBrokenServer = function(){
    return startServer(function(stomp){
        stomp.on('error', function(){});
        stomp.destroy(new Error('unavailable'));
    });
};

describe('connect(options, [connectionListener])', function(){
    
    it('should connect to a stomp server', function(done){
        
        var serverCallback = false;
        var connectCallback = false;
        
        var server = startServer(function(stomp){
            stomp.on('connection', function(){
                serverCallback = true;
                if(serverCallback && connectCallback){
                    done();
                }
            });
        });
        
        connect({
            host: '127.0.0.1',
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
    
    it('should include headers defined by the caller in the CONNECT frame', function(done){
        
        var server = startServer(function(stomp){
            stomp.on('connection', function(conn){
                assert(conn.headers.host === 'test');
                assert(conn.headers.login === 'a');
                assert(conn.headers.passcode === 'b');
                assert(conn.headers.foo === 'bar');
                done();
            });
        });
        
        connect({
            port: server.address().port,
            connectHeaders:{
                host: 'test',
                login: 'a',
                passcode: 'b',
                foo: 'bar'
            }
        });
    });
    
    it('should callback on error', function(done){
       
        var server = startBrokenServer();
        
        connect({
            host:'127.0.0.1',
            port: server.address().port
        }, function(error){
            assert(error);
            done();
        });
    });
    
    it('should accept a transport connect function', function(done){
        
        var server = startServer(function(stomp){
            
        });
        
        var calledTransportFunction = false;
        
        var transport = function(options, callback){
            calledTransportFunction = true;
            return net.connect({
                host: options.host,
                port: options.port 
            }, callback);
        };
        
        var client = connect({
            host:'127.0.0.1',
            port: server.address().port,
            connect: transport
        }, function(error){
            assert(!error);
            assert(calledTransportFunction);
            done();
        });
    });
    
    it('should use tls.connect when ssl option is set to true', function(done){
        
        var serverCallback = false;
        var connectCallback = false;
        
        var server = startSecureServer(function(stomp){
            stomp.on('connection', function(){
                serverCallback = true;
                if(serverCallback && connectCallback){
                    done();
                }
            });
        });
        
        connect({
            host:'localhost',
            port: server.address().port,
            ssl: true,
            ca: [readFile('fixtures/ca.crt')]
        }, function(error, client){
            assert(!error);
            assert(client instanceof Client);
            connectCallback = true;
            if(serverCallback && connectCallback){
                done();
            }
        });
    });
});

describe('connect(port, [host], [connectListener])', function(){
    it('should connect to a stomp server', function(done){
        
        var serverCallback = false;
        var connectCallback = false;
        
        var server = startServer(function(stomp){
            stomp.on('connection', function(){
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

