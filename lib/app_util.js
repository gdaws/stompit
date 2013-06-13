module.exports = new AppUtil();

var util = require("util");
var FrameInputStream = require("./frame_input_stream");

function AppUtil(){
    
}

AppUtil.prototype.init = function(argv){
    this.argv = argv;
    return this;
};

AppUtil.prototype.log = function(message){
    if(this.argv.verbose){
        util.print(message + "\n");
    }
};

AppUtil.prototype.fatalError = function(message){
    process.stderr.write(message + "\n");
    process.exit(1);
};

AppUtil.prototype.fatalErrorEvent = function(format){
    var self = this;
    return function(error){
        self.fatalError(util.format(format, error.message));
    };
};

AppUtil.prototype.parseHeaderLines = function(){
    
    var headers = {};
    
    var headerPattern = /([^:]+):(.*)/;
    
    for(var i = 0; i < arguments.length; i++){
        
        var arg = arguments[i];
        
        if(!(arg instanceof Array)){
            arg = [arg];
        }
        
        for(var j = 0; j < arg.length; j++){
            
            var lines = ("" + arg[j]).split("\n");
            
            for(var k = 0; k < lines.length; k++){
                
                var line = lines[k];
                
                var match = line.match(headerPattern);
                
                if(match){
                    headers[match[1]] = FrameInputStream.prototype.decodeHeaderValue(match[2]);
                }
            }
        }
    }
    
    return headers;
};
