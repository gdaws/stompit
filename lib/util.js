var util = require("util");

function extend(){
    
    var subject;
    var argc = arguments.length;
    var i = 0;
    
    while(i < argc && !(subject instanceof Object)){
        subject = arguments[i];
        i += 1;
    }
    
    for(; i < argc; i++){
        
        var object = arguments[i];
        
        if(!(object instanceof Object)) continue;
        
        for(var key in object){
            if(!subject.hasOwnProperty(key)){
                subject[key] = object[key];
            }
        }
    }
    
    return subject;
}

module.exports = extend(util, {
    extend: extend
});
