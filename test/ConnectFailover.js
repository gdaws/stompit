/*
 * Test stompit.ConnectFailover
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var ConnectFailover = require('../lib/ConnectFailover');
var util            = require('../lib/util');
var MemorySocket    = require('../lib/util/MemorySocket');
var Server          = require('../lib/Server');
var assert          = require('assert');

var createConnector = function(name, accept) {
    return {
        name: name,
        connect: function(options, callback) {
            
            var serverSocket = new MemorySocket();
            var server = new Server(serverSocket);
            
            var socket = serverSocket.getPeerSocket();
            socket.connectOptions = options;
            
            var error;
            if (accept) {
                error = accept();
            }
            
            process.nextTick(function() {
                if (error) {
                    socket.emit('error', error);
                }
                else {
                    callback();
                }
            });
            
            return socket;
        }
    };
};

var getConnectorName = function(client) {
    return client.getTransportSocket().connectOptions.name;
};

var createBrokenConnector = function(connectAfterFailedAttempts) {
    var fails = 0;
    return createConnector(null, function() {
        fails += 1;
        if (fails < connectAfterFailedAttempts) {
            return new Error('unable to connect');
        }
    });
};

var defaultOptions = {
    initialReconnectDelay: 10,
    maxReconnectDelay: 1500,
    useExponentialBackOff: true,
    reconnectDelayExponent: 2.0,
    maxReconnectAttempts: -1,
    maxReconnects: -1,
    randomize: true
};

describe('ConnectFailover', function() {
    
    describe('#connect', function() {
        
        it('should connect to the primary server first', function(done) {
            
            var failover = new ConnectFailover([
                createConnector('primary'), 
                createConnector('secondary')
            ], defaultOptions);
            
            failover.connect(function(error, client) {
                assert(!error);
                assert(getConnectorName(client) === 'primary');
                done();
            });
        });
        
        it('should reconnect', function(done) {
            
            var failover = new ConnectFailover([
                createConnector(),
                createConnector()
            ], defaultOptions);
            
            var lastClient = null;
            
            failover.connect(function(error, client, reconnect) {
                if (lastClient !== null) {
                    assert(lastClient !== client);
                    done();
                    return;
                }
                lastClient = client;
                reconnect();
            });
        });
        
        it('should reconnect to the next server', function(done) {
            
            var failover = new ConnectFailover([
                createConnector(0),
                createConnector(1),
                createConnector(2)
            ], util.extend(defaultOptions, {
                randomize: false
            }));
            
            var index = 0;
            var maxIndex = 2;
            
            failover.connect(function(error, client, reconnect) {
                assert(!error);
                assert(getConnectorName(client) == index);
                index += 1;
                if (index == maxIndex) {
                    done();
                    return;
                }
                reconnect();
            });
        });
        
        it('should stop reconnecting after 3 successful re-connects', function(done) {
            
            var failover = new ConnectFailover([
                createConnector(),
                createConnector(),
            ], util.extend(defaultOptions, {
                maxReconnects: 3
            }));
            
            var connects = 0;
            
            failover.connect(function(error, client, reconnect) {
                
                connects += 1;
                
                if (connects === 5) {
                    assert(error);
                    done();
                    return;
                }
                
                assert(!error);
                reconnect();
            });
        });
        
        it('should connect after any number of failed attempts', function(done) {
            
            var failover = new ConnectFailover([
                createBrokenConnector(8)
            ], util.extend(defaultOptions, {
                maxReconnectAttempts: -1,
                initialReconnectDelay: 1,
                useExponentialBackOff: false
            }));
            
            failover.connect(function(error, client) {
                assert(!error);
                done();
            });
        });
        
        it('should give up trying to connect after a number of failed attempts', function(done) {
            
            var failover = new ConnectFailover([
                createBrokenConnector(8)
            ], util.extend(defaultOptions, {
                maxReconnectAttempts: 2,
                initialReconnectDelay: 1,
                useExponentialBackOff: false
            }));
            
            failover.connect(function(error, client) {
                assert(error);
                done();
            });
        });
    });
    
    describe("#_parseConnectFailoverUri", function() {
        
        var failover = new ConnectFailover([], {});
        var parse = failover._parseFailoverUri.bind(failover);
        
        it('should parse a simple uri', function() {
            var ret = parse('failover:(primary,secondary)');
            assert(typeof ret === 'object');
            assert(ret.servers.length === 2);
            assert(ret.servers[0] === 'primary');
            assert(ret.servers[1] === 'secondary');
        });
        
        it('should parse a server list', function() {
            var ret = parse('primary,secondary');
            assert(typeof ret === 'object');
            assert(ret.servers.length === 2);
            assert(ret.servers[0] === 'primary');
            assert(ret.servers[1] === 'secondary');
        });
        
        it('should parse query string', function() {
            var ret = parse('failover:(primary)?var1=val1&var2=val2');
            assert(typeof ret === 'object');
            assert(typeof ret.options === 'object');
            assert(ret.options.var1 === 'val1');
            assert(ret.options.var2 === 'val2');
        });
        
        it('should accept an empty query string', function() {
            var ret = parse('failover:(primary)?');
            assert(ret.servers.length === 1 && ret.servers[0] === 'primary');
        });
        
        it('should cast values of known options', function() {
            
            var ret = parse('failover:(primary)?initialReconnectDelay=10&maxReconnectDelay=30000&useExponentialBackOff=true&maxReconnectAttempts=-1&maxReconnects=-1&randomize=true');
            
            assert(ret.options.initialReconnectDelay === 10);
            assert(ret.options.maxReconnectDelay === 30000);
            assert(ret.options.useExponentialBackOff === true);
            assert(ret.options.maxReconnectAttempts === -1);
            assert(ret.options.maxReconnects === -1);
            assert(ret.options.randomize === true);
            
            assert(parse('failover:(primary)?randomize=TRUE').options.randomize === true);
            assert(parse('failover:(primary)?randomize=1').options.randomize === true);
            
            assert(parse('failover:(primary)?randomize=FALSE').options.randomize === false);
            assert(parse('failover:(primary)?randomize=0').options.randomize === false);
        });
        
        it('should throw an error for invalid values of known options', function() {
            
            var expectParseError = function(source) {
                
                var thrown = false;
                
                try{
                    parse(source);
                }catch(e) {
                    thrown = true;
                }
                
                assert(thrown);
            };
            
            expectParseError('failover:(sasf)?initialReconnectDelay=zvxvsdf');
            expectParseError('failover:(sasf)?initialReconnectDelay=-2');
            
            expectParseError('failover:(sasf)?maxReconnectDelay=asdf');
            expectParseError('failover:(sasf)?maxReconnectDelay=-34');
            
            expectParseError('failover:(sasf)?useExponentialBackOff=asdf');
            
            expectParseError('failover:(sasf)?maxReconnectAttempts=asdf');
            expectParseError('failover:(sasf)?maxReconnectAttempts=-34');
            
            expectParseError('failover:(sasf)?maxReconnects=asdf');
            expectParseError('failover:(sasf)?maxReconnects=-34');
            
            expectParseError('failover:(sasf)?randomize=asdf');
        });
    });

    describe('#_parseServerUri', function() {
        
        var failover = new ConnectFailover([], {});
        var parse = failover._parseServerUri.bind(failover);
        
        it('should parse a typical uri', function() {
            var ret = parse('tcp://localhost:61613');
            assert(typeof ret === 'object');
            assert(ret.host === 'localhost');
            assert(ret.port === 61613);
        });
        
        it('should parse without a scheme', function() {
            var ret = parse('localhost:1234');
            assert(typeof ret === 'object');
            assert(ret.host === 'localhost');
            assert(ret.port === 1234);
        });
        
        it('should parse without a port', function() {
            var ret = parse('localhost');
            assert(ret.host === 'localhost');
            assert(ret.port === void 0);
        });
        
        it('should parse login and passcode', function() {
            
            var ret = parse('user:pass@localhost:123');
            assert(ret.connectHeaders.login === 'user');
            assert(ret.connectHeaders.passcode === 'pass');
            assert(ret.host === 'localhost');
            assert(ret.port === 123);
            
            ret = parse('tcp://user:pass@localhost');
            assert(ret.connectHeaders.login === 'user');
            assert(ret.connectHeaders.passcode === 'pass');
            assert(ret.host === 'localhost');
            assert(ret.port === void 0);
        });
        
        it('should ignore leading and trailing whitespace', function() {
            assert(parse('  localhost  \t').host === 'localhost');
        });
    });
});
