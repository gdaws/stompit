var util = require("util");
var fs = require("fs");
var path = require("path");

function extend(destination){
    
    var argc = arguments.length;
    
    for(var i = 1; i < argc; i++){
        
        var source = arguments[i];
        
        if(source){
            for(var key in source){
                destination[key] = source[key];
            }
        }
    }
    
    return destination;
}

function readPackageJson(){
    return JSON.parse(fs.readFileSync(path.dirname(module.filename) + "/../package.json"));
}

module.exports = extend(util, {
    extend: extend,
    readPackageJson: readPackageJson
});
