module.exports = new AppUtil();

var util = require("util");

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
