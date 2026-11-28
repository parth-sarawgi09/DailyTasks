const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const { hashPassword } = require("../src/auth");

const jwtSecret = "test-only-secret-that-is-never-used-outside-tests";
const usersToCreate = [
  {
    id: "manager-1",
    email: "manager@example.test",
    password: "manager-password-2026",
    role: "inventory_manager",
    supplierIds: ["supplier-101"],
  },
  {
    id: "viewer-1",
    email: "viewer@example.test",
    password: "viewer-password-2026",
    role: "viewer",
    supplierIds: ["supplier-101"],
  },
  {
    id: "admin-1",
    email: "admin@example.test",
    password: "administrator-password-2026",
    role: "admin",
    supplierIds: [],
  },
];

let server;
let baseUrl;
let users;

beforeEach(async () => {
  users = await Promise.all(usersToCreate.map(async ({ password, ...user }) => ({
    ...user,
    passwordHash: await hashPassword(password),
  })));
  server = createApp({ jwtSecret, users }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { response, payload: await response.json() };
}

test("hashes passwords with a per-password salt and verifies only the matching password", async () => {
  const firstHash = await hashPassword("a-long-password-for-tests");
  const secondHash = await hashPassword("a-long-password-for-tests");

  assert.notEqual(firstHash, secondHash);
  assert.equal(await require("../src/auth").verifyPassword("a-long-password-for-tests", firstHash), true);
  assert.equal(await require("../src/auth").verifyPassword("incorrect-password", firstHash), false);
});

test("rejects login with invalid credentials without disclosing whether the email exists", async () => {
  const { response, payload } = await login("manager@example.test", "wrong-password-2026");
  const { response: missingUserResponse, payload: missingUserPayload } = await login("missing@example.test", "wrong-password-2026");

  assert.equal(response.status, 401);
  assert.deepEqual(payload, { error: "Invalid email or password" });
  assert.equal(missingUserResponse.status, 401);
  assert.deepEqual(missingUserPayload, payload);
});

test("requires a token and a permitted role to read inventory", async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/inventory`);
  assert.equal(unauthenticated.status, 401);

  const { payload } = await login("viewer@example.test", "viewer-password-2026");
  const forbidden = await fetch(`${baseUrl}/api/inventory`, {
    headers: { Authorization: `Bearer ${payload.data.accessToken}` },
  });
  assert.equal(forbidden.status, 403);
});

test("limits managers to their suppliers and creates replenishment only under the stock threshold", async () => {
  const { payload } = await login("manager@example.test", "manager-password-2026");
  const headers = { Authorization: `Bearer ${payload.data.accessToken}` };
  const inventoryResponse = await fetch(`${baseUrl}/api/inventory`, { headers });
  const inventoryPayload = await inventoryResponse.json();
  assert.deepEqual(inventoryPayload.data.map((item) => item.id), ["item-thermal-paper"]);

  const foreignSupplierOrder = await fetch(`${baseUrl}/api/inventory/item-label-rolls/replenishments`, {
    method: "POST",
    headers,
  });
  assert.equal(foreignSupplierOrder.status, 403);

  const ownSupplierOrder = await fetch(`${baseUrl}/api/inventory/item-thermal-paper/replenishments`, {
    method: "POST",
    headers,
  });
  const orderPayload = await ownSupplierOrder.json();
  assert.equal(ownSupplierOrder.status, 201);
  assert.equal(orderPayload.data.supplierId, "supplier-101");
  assert.equal(orderPayload.data.quantity, 100);
});

test("allows an admin to see all suppliers but rejects replenishment above threshold", async () => {
  const { payload } = await login("admin@example.test", "administrator-password-2026");
  const headers = { Authorization: `Bearer ${payload.data.accessToken}` };
  const inventoryResponse = await fetch(`${baseUrl}/api/inventory`, { headers });
  const inventoryPayload = await inventoryResponse.json();
  assert.equal(inventoryPayload.data.length, 2);

  const response = await fetch(`${baseUrl}/api/inventory/item-label-rolls/replenishments`, {
    method: "POST",
    headers,
  });
  assert.equal(response.status, 409);
});

test("rejects expired JWTs", async () => {
  const expiredToken = jwt.sign({}, jwtSecret, {
    algorithm: "HS256",
    subject: "manager-1",
    issuer: "day6-inventory",
    audience: "inventory-api",
    expiresIn: -1,
  });
  const response = await fetch(`${baseUrl}/api/inventory`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });

  assert.equal(response.status, 401);
});
