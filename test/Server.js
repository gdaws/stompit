/*jslint node: true, indent: 2, camelcase: true, esversion: 9 */

const Client = require('../lib/Client');
const Server = require('../lib/Server');
const MemorySocket = require('../lib/util/MemorySocket');
const BufferWritable = require('../lib/util/buffer/BufferWritable');
const assert = require('assert');

const fail = function(){assert(false);};

describe('Server', function(){
    
    var socket, client, server;
    
    beforeEach(function(){
        
        socket = new MemorySocket();
        
        server = new Server(socket);
        
        server._disconnect = function(frame, beforeSendResponse){
            beforeSendResponse(null);
        };
        
        client = new Client(socket.getPeerSocket());
    });
    
    describe('on receiving unknown command', function(){
        
        it('should send an error frame', function(done){
            
            client.setCommandHandler('ERROR', function(frame){
                done();
            });
            
            client.on('error', function(){});
            server.on('error', function(){});
            
            client.sendFrame('SDLFIJ', {}).end();
        });
        
        it('should end the transport socket', function(done){
            
            client.getTransportSocket().once('end', function(){
               done();
            });
            
            client.setCommandHandler('ERROR', function(frame){});
            
            client.on('error', function(){});
            server.on('error', function(){});
            
            client.sendFrame('SDFDS', {}).end();
        });
    });
    
    describe('on receiving DISCONNECT command', function(){
        
        it('should reply with a receipt', function(done){
            client.connect('localhost', function(){
                client.disconnect(function(){
                    done();
                });
            });
        });
    });
});
