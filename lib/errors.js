
var util = require("./util");

module.exports = {
    TransportError: util.defineErrorClass("Transport error"),
    ProtocolError:  util.defineErrorClass("Protocol error"),
    ApplicationError: util.defineErrorClass("Application error")
};
