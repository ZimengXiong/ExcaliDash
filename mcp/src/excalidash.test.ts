import assert from "node:assert/strict";
import test from "node:test";
import {
  configFromEnv,
  ExcaliDashClient,
  ExcaliDashError,
  type Fetch,
} from "./excalidash.js";

const config = {
  url: "https://dash.example.test/",
  token: "secret-agent-token",
  drawingId: "drawing/one",
};

test("configFromEnv requires URL and token while drawing ID is optional", () => {
  assert.deepEqual(
    configFromEnv({
      EXCALIDASH_URL: " https://dash.example.test ",
      EXCALIDASH_API_KEY: " token ",
    }),
    {
      url: "https://dash.example.test",
      token: "token",
      drawingId: undefined,
    },
  );
  assert.throws(() => configFromEnv({}), /EXCALIDASH_URL is required/);
});

test("HTTP failures are bounded and never include the configured token", async () => {
  const fetchImpl: Fetch = async () =>
    new Response("secret-agent-token reflected upstream " + "x".repeat(3000), {
      status: 422,
    });
  const client = new ExcaliDashClient(config, fetchImpl);

  await assert.rejects(client.getSummary("drawing/one"), (error: unknown) => {
    assert.ok(error instanceof ExcaliDashError);
    assert.equal(error.status, 422);
    assert.ok(error.message.length < 2100);
    assert.doesNotMatch(error.message, /secret-agent-token/);
    return true;
  });
});
