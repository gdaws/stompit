/*
 * Test stompit.Failover
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var Failover        = require('../lib/failover');
var MemorySocket    = require('../lib/memory_socket');
var util            = require('../lib/util');
var assert          = require('assert');

var createConnector = function(name){
    return function(callback){
        var socket = new MemorySocket();
        socket.name = name;
        process.nextTick(callback.bind(null, null, socket));
        return socket;
    };
};

var createBrokenConnector = function(connectAfterFailedAttempts){
    
    var attempts = 0;
    
    return function(callback){
        
        attempts += 1;
        
        var socket = new MemorySocket();
        
        if(attempts > connectAfterFailedAttempts){
            process.nextTick(callback.bind(null, null, socket));
        }
        else{
            process.nextTick(callback.bind(null, new Error('unable to connect')));
        }
        
        return socket;
    };
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

describe('Failover', function(){
    
    describe('#connect', function(){
        
        it('should connect to the primary server first', function(done){
            
            var failover = new Failover([
                createConnector('primary'), 
                createConnector('secondary')
            ], defaultOptions);
            
            failover.connect(function(error, client){
                assert(!error);
                assert(client.name === 'primary');
                done();
            });
        });
        
        it('should reconnect', function(done){
            
            var failover = new Failover([
                createConnector(),
                createConnector()
            ], defaultOptions);
            
            var lastClient = null;
            
            var connection = failover.connect(function(error, client){
                if(lastClient !== null){
                    assert(lastClient !== client);
                    done();
                    return;
                }
                lastClient = client;
                connection.reconnect();
            });
        });
        
        it('should reconnect to the next server', function(done){
            
            var failover = new Failover([
                createConnector(0),
                createConnector(1),
                createConnector(2)
            ], util.extend(defaultOptions, {
                randomize: false
            }));
            
            var index = 0;
            var maxIndex = 2;
            
            var connection = failover.connect(function(error, client){
                assert(!error);
                assert(client.name == index);
                index += 1;
                if(index == maxIndex){
                    done();
                    return;
                }
                connection.reconnect();
            });
        });
        
        it('should stop reconnecting after 3 successful re-connects', function(done){
            
            var failover = new Failover([
                createConnector(),
                createConnector(),
            ], util.extend(defaultOptions, {
                maxReconnects: 3
            }));
            
            var connects = 0;
            
            var connection = failover.connect(function(error, client){
                
                connects += 1;
                
                if(connects === 5){
                    assert(error);
                    done();
                    return;
                }
                
                assert(!error);
                connection.reconnect(); 
            });
        });
        
        it('should should connect after any number of failed attempts', function(done){
            
            var failover = new Failover([
                createBrokenConnector(8)
            ], util.extend(defaultOptions, {
                maxReconnectAttempts: -1,
                initialReconnectDelay: 1,
                useExponentialBackOff: false
            }));
            
            failover.connect(function(error, client){
                assert(!error);
                done();
            });
        });
        
        it('should give up trying to connect after a number of failed attempts', function(done){
            
            var failover = new Failover([
                createBrokenConnector(8)
            ], util.extend(defaultOptions, {
                maxReconnectAttempts: 2,
                initialReconnectDelay: 1,
                useExponentialBackOff: false
            }));
            
            failover.connect(function(error, client){
                assert(error);
                done();
            });
        });
    });
});
