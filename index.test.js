const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { scrubBody, applicationsUrl } = require("./index.js");

describe("scrubBody", () => {
  it("strips Couch and full_message fields", () => {
    const cleaned = scrubBody({
      type: "VeteranApp",
      app_status: "New",
      cburi: "https://example.couch/db",
      cbusr: "secret-user",
      cbpwd: "secret-pass",
      full_message: "raw form dump"
    });

    assert.deepEqual(cleaned, {
      type: "VeteranApp",
      app_status: "New"
    });
  });

  it("does not mutate the original object", () => {
    const original = { type: "VeteranApp", cburi: "x" };
    scrubBody(original);
    assert.equal(original.cburi, "x");
  });
});

describe("applicationsUrl", () => {
  it("appends /review/applications and trims trailing slash", () => {
    assert.equal(
      applicationsUrl("https://sshf-api-330507742215.us-central1.run.app/"),
      "https://sshf-api-330507742215.us-central1.run.app/review/applications"
    );
  });
});
