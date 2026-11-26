const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const { createApp } = require("../src/app");

let server;
let baseUrl;

beforeEach(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

const validWorkout = {
  athleteId: "athlete-42",
  exercise: "Back squat",
  durationMinutes: 45,
  completedAt: "2026-11-25T18:30:00Z",
  sets: 3,
  repsPerSet: 8,
  weightKg: 60,
};

test("records a valid workout and returns progress analytics", async () => {
  const response = await fetch(`${baseUrl}/api/workout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validWorkout),
  });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.ok(response.headers.get("x-request-id"));
  assert.equal(payload.workout.volumeKg, 1440);
  assert.deepEqual(payload.progress, {
    completedSessions: 1,
    totalDurationMinutes: 45,
    totalVolumeKg: 1440,
  });
});

test("rejects invalid workout values without changing progress", async () => {
  const response = await fetch(`${baseUrl}/api/workout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...validWorkout, sets: 0 }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.ok(response.headers.get("x-request-id"));
  assert.ok(payload.error.details.some((issue) => issue.field === "sets"));
  assert.equal(payload.error.requestId, response.headers.get("x-request-id"));

  const success = await fetch(`${baseUrl}/api/workout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validWorkout),
  });
  const successPayload = await success.json();
  assert.equal(successPayload.progress.completedSessions, 1);
});

test("formats malformed JSON as a centralized 400 response", async () => {
  const response = await fetch(`${baseUrl}/api/workout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"athleteId":',
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.message, "Request body must be valid JSON");
  assert.equal(payload.error.requestId, response.headers.get("x-request-id"));
});
