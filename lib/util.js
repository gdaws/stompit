var util = require("util");

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

module.exports = extend(util, {
    extend: extend
});
