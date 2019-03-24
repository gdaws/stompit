/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { Client, connect } = require('../lib/index');
const Server = require('../lib/Server');
const assert = require('assert');

const startServer = function(listener){
    var server = net.createServer({family: 4}, function(socket){
        var stomp = new Server(socket);
        listener(stomp);
    });
    server.listen(0);
    return server;
};

const readFile = function(filename){
    if(filename[0] !== '/'){
        filename = path.dirname(module.filename) + path.sep + filename;
    }
    return fs.readFileSync(filename);
};

const startBrokenServer = function(){
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

        var transport = function(options) {
            assert(options.host == '127.0.0.7');
            assert(options.port == 61619);
            done();
        };
        
        connect({
            host:'127.0.0.7',
            port: 61619,
            connect: transport
        });
    });
    
    it('should use tls.connect when ssl option is true', function(done){
        
        var nativeTlsConnect = tls.connect;

        tls.connect = function() {
            tls.connect = nativeTlsConnect;
            done();
            return nativeTlsConnect.apply(this, arguments);
        };

        connect({
            host: 'localhost',
            port: 61613,
            ssl: true,
            ca: [readFile('fixtures/ca.crt')],
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

describe('connect', function(){
    
    it('throw error on zero arguments', function() {
        assert.throws(function(){
            
            connect();
            
        }, function(error){
            return error.message == 'no connect arguments';
        });
    });
    
    it('throw error on invalid port/path argument', function() {
        
        assert.throws(function(){
            
            connect(function(){});
            
        }, function(error){
            return error.message === 'invalid connect argument (expected port or path value)';
        });
    });
    
    it('throw on invalid connectListener argument', function() {
        
        assert.throws(function(){
            
            connect(61613, 'localhost', 'not_a_function');
            
        }, function(error){
            return error.message == 'invalid connect argument ' +  
                '(expected connectListener argument to be a function)';
        });
    });
    
    it('throw on too many arguments', function() {
        assert.throws(function(){
            
            connect(61613, 'localhost', function(){}, true);
            
        }, function(error){
            return error.message == 'too many arguments';
        });
    });
});

describe('connect.normalizeConnectArgs', function() {
    
    it('normalize (path, [connectListner])', function(){
        
        var cb = function(){};
        
        var args = connect.normalizeConnectArgs(['/foo.sock', cb]);
        
        assert.equal(args[0].path, '/foo.sock');
        assert.equal(args[0].host, void 0);
        assert.equal(args[0].port, void 0);
        assert.equal(args[1], cb);
        
        args = connect.normalizeConnectArgs(['/foo.sock']);
        
        assert.equal(args[0].path, '/foo.sock');
        assert.equal(args[0].host, void 0);
        assert.equal(args[0].port, void 0);
        assert.equal(args[1], void 0);
    });
    
    it('normalize (port, [connectListner])', function(){
        
        var cb = function(){};
        
        var args = connect.normalizeConnectArgs(['123', cb]);
        
        assert.equal(args[0].path, void 0);
        assert.equal(args[0].host, 'localhost');
        assert.equal(args[0].port, 123);
        assert.equal(args[1], cb);
        
        args = connect.normalizeConnectArgs([65534]);
        
        assert.equal(args[0].path, void 0);
        assert.equal(args[0].host, 'localhost');
        assert.equal(args[0].port, 65534);
        assert.equal(args[1], void 0);
    });
    
    it('normalize (port, host, [connectListner])', function(){
        
        var cb = function(){};
        
        var args = connect.normalizeConnectArgs(['123', 'example.com', cb]);
        
        assert.equal(args[0].path, void 0);
        assert.equal(args[0].host, 'example.com');
        assert.equal(args[0].port, 123);
        assert.equal(args[1], cb);
        
        args = connect.normalizeConnectArgs([65300, 'example.com']);
        
        assert.equal(args[0].path, void 0);
        assert.equal(args[0].host, 'example.com');
        assert.equal(args[0].port, 65300);
        assert.equal(args[1], void 0);
    });
});
