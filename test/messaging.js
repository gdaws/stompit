/*
 * Test stompit.Messaging
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var Messaging = require('../lib/messaging');
var MemorySocket = require('../lib/util/memory_socket');
var Client = require('../lib/client');
var Server = require('../lib/server');
var assert = require('assert');

var createConnector = function(serverSocket){
    var client = new Client(serverSocket.getPeerSocket());
    return function(callback){
        
        client.connect({}, function(){
            callback(null, client);
        });
        
        return client;
    };
};

describe('Messaging', function(){
    
    var server1, server2, msging;
    
    beforeEach(function(){
        
        server1 = new Server(new MemorySocket());
        server2 = new Server(new MemorySocket());
        
        msging = new Messaging([
            createConnector(server1.getTransportSocket()),
            createConnector(server2.getTransportSocket())
        ], {
            randomize: false
        });
    });
    
    describe('#send', function(){
        
        it('should send the message to the next server if the first server fails to accept the message', function(done){
            
            server1.on('error', function(){});
            
            server1.on('connection', function(){
                server1.setCommandHandler('SEND', function(){
                    server1.sendError('unable to handle message').end();
                });
            });
            
            server2.on('connection', function(){
                server2.setCommandHandler('SEND', function(){
                    done();
                });
            });
            
            msging.send('/queue/test!', 'hello');
        });
    });
});
