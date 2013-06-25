
var helper = require("./lib/helper");

module.exports = {
    
    Client: require("./lib/client"),
    
    FrameInputStream: require("./lib/frame_input_stream"),
    FrameOutputStream: require("./lib/frame_output_stream"),
    
    connect: helper.connect
};
