var util = require("../lib/util");
var assert = require("assert");

describe("util.extend", function(){
    
    it("should use the first object argument as the destination object", function(){
        
        var input = {};
        var output = util.extend(input);
        
        assert(input === output);
        
        var result = {a: true};
        util.extend(result, {b: true});
        
        assert(result.a);
        assert(result.b);
    });
    
    it("should overwrite properties from subsequent arguments", function(){
        assert(util.extend({c:1}, {c:2}, {c:3}).c === 3);
    });
    
    it("should copy each property into the destination object", function(){
        
        var result = util.extend({a:true}, {b:true}, {c:true});
        
        assert(result.a);
        assert(result.b);
        assert(result.c);
    });
});
