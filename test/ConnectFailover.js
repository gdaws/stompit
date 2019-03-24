/*jslint node: true, indent: 2, camelcase: true, esversion: 9 */

const { ConnectFailover } = require('../lib/index');
const parseFailoverUri = require('../lib/connect-failover/parseFailoverUri');
const parseServerUri = require('../lib/connect-failover/parseServerUri');
const MemorySocket = require('../lib/util/MemorySocket');
const Server = require('../lib/Server');
const assert = require('assert');

var createConnector = function(name, options) {
    
    options = options || {};
    
    var connector = {
        name: name,
        connects: 0,
        connectAfter: options.connectAfter || 0,
        connectError: options.connectError,
        failAfter: options.failAfter || Infinity
    };
    
    var connect = function(options, callback) {
        
        connector.connects += 1;
        
        var serverSocket = new MemorySocket();
        var server = new Server(serverSocket);
        
        if (options.connectError) {
            server.setCommandHandler("CONNECT", function() {
                server.sendError(options.connectError).end();
            });
            server.on('error', function(){});
        }
        
        var socket = serverSocket.getPeerSocket();
        socket.connectOptions = options;
        
        var error;
        
        if (connector.connects < connector.connectAfter || 
            connector.connects >= connector.failAfter) {
        
            error = new Error('unable to connect');
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
    };
    
    connector.connect = connect;
    
    return connector;
};

var getConnectorName = function(client) {
    return client.getTransportSocket().connectOptions.name;
};

var createBrokenConnector = function(connectAfterFailedAttempts) {
    
    return createConnector(null, {
        connectAfter: connectAfterFailedAttempts
    });
};

var defaultOptions = {
    initialReconnectDelay: 10,
    maxReconnectDelay: 1500,
    useExponentialBackOff: true,
    reconnectDelayExponent: 2.0,
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
            ], Object.assign(defaultOptions, {
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
        
        it('should stop reconnecting after 3 failed connects for each server', function(done) {
            
            var servers = [
            
                createConnector(1, {
                    connectAfter: Infinity
                }),
                
                createConnector(2, {
                    connectAfter: Infinity
                })
            ];
            
            var failover = new ConnectFailover(servers, Object.assign(defaultOptions, {
                maxReconnects: 3,
                useExponentialBackOff: false,
                initialReconnectDelay: 1
            }));
            
            var connects = 0;
            
            failover.connect(function(error, client, reconnect) {
                
                assert(error);
                
                assert.equal(servers[0].connects, 3);
                assert.equal(servers[1].connects, 3);
                
                done();
            });
        });
        
        it('should connect after 8 failed attempts', function(done) {
            
            var failover = new ConnectFailover([
                createConnector(null, {
                    connectAfter: 8
                })
            ], Object.assign(defaultOptions, {
                maxReconnects: -1,
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
                createConnector(null, {
                    connectAfter: Infinity
                })
            ], Object.assign(defaultOptions, {
                maxReconnects: 2,
                initialReconnectDelay: 1,
                useExponentialBackOff: false
            }));
            
            failover.connect(function(error, client) {
                assert(error);
                done();
            });
        });
        
        it('should give up on application connect error', function(done) {
            
            var failover = new ConnectFailover([
                createConnector(null, {
                    connectError: 'invalid login'
                })
            ], Object.assign(defaultOptions, {
                maxReconnects: -1
            }));
            
            failover.connect(function(error, client) {
                assert(error);
                done();
            });
        });
    });
    
    describe("#_parseConnectFailoverUri", function() {
        
        var parse = parseFailoverUri;
        
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

        it('parse query string variable into string', function() {
            var ret = parse('failover:(primary)?var1=1,2');
            assert(ret.options.var1 === '1,2');
        });
        
        it('should accept an empty query string', function() {
            var ret = parse('failover:(primary)?');
            assert(ret.servers.length === 1 && ret.servers[0] === 'primary');
        });
        
        it('should cast values of known options', function() {
            
            var ret = parse('failover:(primary)?initialReconnectDelay=10&maxReconnectDelay=30000&useExponentialBackOff=true&maxReconnects=-1&randomize=true');
            
            assert(ret.options.initialReconnectDelay === 10);
            assert(ret.options.maxReconnectDelay === 30000);
            assert(ret.options.useExponentialBackOff === true);
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
            
            expectParseError('failover:(sasf)?maxReconnects=asdf');
            expectParseError('failover:(sasf)?maxReconnects=-34');
            
            expectParseError('failover:(sasf)?randomize=asdf');
        });
    });

    describe('#_parseServerUri', function() {
        
        var parse = parseServerUri;
        
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
