/*jslint node: true, indent: 2, unused: true, maxlen: 80, camelcase: true */

module.exports = {
  init: init
};

var util = require("../util");
var FrameInputStream = require("../frame_input_stream");

function AppUtil(argv) {
  this.argv = argv;
}

function init(argv) {
  return new AppUtil(argv);
}

AppUtil.prototype.log = function(message) {
  if (this.argv.verbose) {
    console.log(message);
  }
};

AppUtil.prototype.fatalError = function(message) {
  process.stderr.write(message + "\n");
  process.exit(1);
};

AppUtil.prototype.fatalErrorEvent = function(format) {
  
  var self = this;
  
  return function(error) {
    
    var message;
    
    if (format) {
      message = util.format(format, error.message);
    }
    else{
      
      message = error.message;
      
      if (error.longMessage) {
        message += "\n\t" + error.longMessage;
      }
    }
    
    self.fatalError(message);
  };
};

AppUtil.prototype.parseHeaderLines = function() {
  
  var headers = {};
  
  var headerPattern = /([^:]+):(.*)/;
  
  for (var i = 0; i < arguments.length; i++) {
    
    var arg = arguments[i];
    
    if (!(arg instanceof Array)) {
      arg = [arg];
    }
    
    for (var j = 0; j < arg.length; j++) {
      
      var lines = ("" + arg[j]).split("\n");
      
      for (var k = 0; k < lines.length; k++) {
        
        var line = lines[k];
        
        var match = line.match(headerPattern);
        
        if (match) {
          headers[match[1]] = FrameInputStream.prototype.decodeHeaderValue(
            match[2]
          );
        }
      }
    }
  }
  
  return headers;
};
