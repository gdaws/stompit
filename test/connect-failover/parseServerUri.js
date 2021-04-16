/*jslint node: true, indent: 2, unused: true, maxlen: 160, camelcase: true, esversion: 9 */

const parseServerUri = require("../../lib/connect-failover/parseServerUri");
const assert = require("assert");

describe("parseServerUri", function () {
  it("should correctly parse a stomp URI", function () {
    const result = parseServerUri("stomp://host:1234");
    assert.deepEqual(result, {
      connectHeaders: {},
      host: "host",
      port: 1234,
      ssl: false,
    });
  });

  it("should correctly parse the user name and password from the URI", function () {
    const result = parseServerUri("stomp://user:pass@host:1234");
    assert.deepEqual(result, {
      connectHeaders: {
        login: "user",
        passcode: "pass",
      },
      host: "host",
      port: 1234,
      ssl: false,
    });
  });

  it("should correctly parse an SSL URI", function () {
    const result = parseServerUri("ssl://host:1234");
    assert.deepEqual(result, {
      connectHeaders: {},
      host: "host",
      port: 1234,
      ssl: true,
    });
  });

  it("should correctly parse a stomp+SSL URI", function () {
    const result = parseServerUri("stomp+ssl://host:1234");
    assert.deepEqual(result, {
      connectHeaders: {},
      host: "host",
      port: 1234,
      ssl: true,
    });
  });

  it("should not parse an invalidhost name", function () {
    let handledException = false;
    try {
      parseServerUri("stomp://host*name.com:1234");
    } catch (err) {
      handledException = true;
      assert(
        err.message ===
          "could not parse server uri 'stomp://host*name.com:1234'"
      );
    }
    assert(handledException);
  });
});
