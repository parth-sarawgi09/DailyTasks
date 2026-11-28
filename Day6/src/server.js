const { createApp } = require("./app");
const { hashPassword } = require("./auth");

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set before starting the inventory API`);
  }
  return value;
}

function parseSupplierIds(value) {
  const supplierIds = value.split(",").map((supplierId) => supplierId.trim()).filter(Boolean);
  if (!supplierIds.length || supplierIds.some((supplierId) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(supplierId))) {
    throw new Error("INVENTORY_MANAGER_SUPPLIER_IDS must be a comma-separated list of valid supplier ids");
  }
  return supplierIds;
}

async function start() {
  const jwtSecret = requiredEnvironment("JWT_SECRET");
  if (Buffer.byteLength(jwtSecret) < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes");
  }

  const managerEmail = requiredEnvironment("INVENTORY_MANAGER_EMAIL");
  const managerPassword = requiredEnvironment("INVENTORY_MANAGER_PASSWORD");
  const users = [{
    id: "manager-1",
    email: managerEmail,
    passwordHash: await hashPassword(managerPassword),
    role: "inventory_manager",
    supplierIds: parseSupplierIds(requiredEnvironment("INVENTORY_MANAGER_SUPPLIER_IDS")),
  }];

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (Boolean(adminEmail) !== Boolean(adminPassword)) {
    throw new Error("Set both ADMIN_EMAIL and ADMIN_PASSWORD to provision an admin account");
  }
  if (adminEmail && adminPassword) {
    users.push({
      id: "admin-1",
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      role: "admin",
      supplierIds: [],
    });
  }

  const port = Number(process.env.PORT) || 3000;
  createApp({ jwtSecret, users }).listen(port, () => {
    console.log(`Inventory auth API listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
