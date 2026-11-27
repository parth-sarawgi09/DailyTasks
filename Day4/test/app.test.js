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

function timestampOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function serviceRecord(overrides = {}) {
  return {
    serviceType: "oil_change",
    servicedAt: timestampOffset(-30),
    nextDueAt: timestampOffset(365),
    odometerKm: 48250,
    notes: "Replaced oil and filter",
    ...overrides,
  };
}

test("records valid vehicle maintenance and returns current due status", async () => {
  const response = await fetch(`${baseUrl}/api/vehicles/TRUCK-204/maintenance-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serviceRecord()),
  });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.ok(response.headers.get("x-request-id"));
  assert.equal(payload.data.vehicleId, "TRUCK-204");
  assert.equal(payload.data.serviceType, "oil_change");
  assert.equal(payload.data.dueStatus, "current");
  assert.equal(payload.data.odometerKm, 48250);
});

test("rejects invalid fields and does not store an invalid maintenance record", async () => {
  const response = await fetch(`${baseUrl}/api/vehicles/TRUCK-204/maintenance-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serviceRecord({
      servicedAt: "2026-02-30T10:00:00Z",
      nextDueAt: timestampOffset(-60),
      odometerKm: -1,
    })),
  });
  const payload = await response.json();

  assert.equal(response.status, 422);
  assert.equal(payload.error.code, "validation_failed");
  assert.equal(payload.error.requestId, response.headers.get("x-request-id"));
  assert.deepEqual(payload.error.details.map((issue) => issue.field), ["servicedAt", "odometerKm"]);

  const listResponse = await fetch(`${baseUrl}/api/vehicles/TRUCK-204/maintenance-records`);
  const listPayload = await listResponse.json();
  assert.deepEqual(listPayload, { data: [], count: 0 });
});

test("marks service due soon or overdue based on its next due date", async () => {
  for (const [days, expectedStatus] of [[7, "due_soon"], [-1, "overdue"]]) {
    const response = await fetch(`${baseUrl}/api/vehicles/VAN-17/maintenance-records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serviceRecord({ nextDueAt: timestampOffset(days) })),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.data.dueStatus, expectedStatus);
  }
});

test("formats malformed JSON through the centralized error handler", async () => {
  const response = await fetch(`${baseUrl}/api/vehicles/TRUCK-204/maintenance-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"serviceType":',
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "invalid_json");
  assert.equal(payload.error.requestId, response.headers.get("x-request-id"));
});

test("returns a consistent error response for unknown routes", async () => {
  const response = await fetch(`${baseUrl}/api/vehicles/TRUCK-204/unknown`);
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "not_found");
  assert.equal(payload.error.requestId, response.headers.get("x-request-id"));
});
