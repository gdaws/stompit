/*
 * stompit.connect
 * Copyright (c) 2013 Graham Daws <graham.daws@gmail.com>
 * MIT licensed
 */

var net     = require('net');
var tls     = require('tls');
var util    = require('./util');
var Client  = require('./client');

// Connect to a server and establish a STOMP session.
function connect(){
    
    var args = net._normalizeConnectArgs(arguments);
    
    var options = util.extend({
        host: 'localhost',
        connectHeaders: {}
    }, args[0]);
    
    if(options.port === undefined || typeof options.port === 'function'){
        options.port = 61613;
    }
    
    var cb = args[1];
    
    var client, socket, timeout;
    
    var cleanup = function(){
        
        if(timeout){
            clearTimeout(timeout);
        }
        
        client.removeListener('error', onError);
        client.removeListener('connect', onConnected);
    };
    
    var onError = function(error){
        
        error.connectArgs = options;
        
        cleanup();
        
        if(typeof cb === 'function'){
            cb(error);
        }
    };
    
    var onConnected = function(){
        cleanup();
        client.emit('socket-connect');
        client.connect(util.extend({host: options.host}, options.connectHeaders), cb);
    };
    
    if('timeout' in options){
        var timeout = setTimeout(function(){
            client.destroy(client.createTransportError('connect timed out'));
        }, options.timeout);
    }
    
    var transportConnect = net.connect;
    
    if('connect' in options){
        transportConnect = options.connect;
    }
    else{
        if('ssl' in options){
            if(typeof options.ssl === 'boolean'){
                if(options.ssl === true){
                    transportConnect = tls.connect;
                }
            }
            else{
                if(options.ssl !== void 0){
                    throw new Error('expected ssl property to have boolean value');
                }
            }
        }
    }
    
    socket = transportConnect(options, onConnected);
    
    client = new Client(socket, options);
    
    client.on('error', onError);
    
    return client;
}

module.exports = connect;
