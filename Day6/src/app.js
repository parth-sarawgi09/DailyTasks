const express = require("express");
const { randomBytes } = require("node:crypto");
const {
  ACCESS_TOKEN_LIFETIME,
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} = require("./auth");

const inventory = [
  {
    id: "item-thermal-paper",
    name: "Thermal receipt paper",
    stock: 12,
    reorderThreshold: 20,
    replenishmentQuantity: 100,
    supplierId: "supplier-101",
  },
  {
    id: "item-label-rolls",
    name: "Shipping label rolls",
    stock: 36,
    reorderThreshold: 15,
    replenishmentQuantity: 50,
    supplierId: "supplier-202",
  },
];

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function createApp({ jwtSecret, users = [] } = {}) {
  if (typeof jwtSecret !== "string" || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 bytes");
  }

  const usersByEmail = new Map();
  const usersById = new Map();
  for (const user of users) {
    if (!user.id || !user.email || !user.passwordHash || !user.role) {
      throw new Error("Each configured user must have an id, email, passwordHash, and role");
    }
    const email = normalizeEmail(user.email);
    if (usersByEmail.has(email) || usersById.has(user.id)) {
      throw new Error("Configured user ids and email addresses must be unique");
    }
    usersByEmail.set(email, { ...user, email });
    usersById.set(user.id, { ...user, email });
  }

  const dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));
  const replenishments = [];
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.post("/api/auth/login", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const password = req.body?.password;
    if (!email || typeof password !== "string" || password.length > 128) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = usersByEmail.get(normalizeEmail(email));
    const passwordHash = user ? user.passwordHash : await dummyPasswordHash;
    const validPassword = await verifyPassword(password, passwordHash);
    if (!user || !validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      data: {
        accessToken: signAccessToken(user, jwtSecret),
        tokenType: "Bearer",
        expiresIn: ACCESS_TOKEN_LIFETIME,
        user: { id: user.id, email: user.email, role: user.role },
      },
    });
  });

  function requireAuthentication(req, res, next) {
    const authorization = req.get("authorization") || "";
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match) {
      return res.status(401).json({ error: "A valid bearer token is required" });
    }

    try {
      const userId = verifyAccessToken(match[1], jwtSecret);
      const user = usersById.get(userId);
      if (!user) {
        return res.status(401).json({ error: "A valid bearer token is required" });
      }
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ error: "A valid bearer token is required" });
    }
  }

  function requireInventoryRole(req, res, next) {
    if (!["inventory_manager", "admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Inventory manager access is required" });
    }
    return next();
  }

  function canManageSupplier(user, supplierId) {
    return user.role === "admin" || user.supplierIds?.includes(supplierId) === true;
  }

  app.get("/api/inventory", requireAuthentication, requireInventoryRole, (req, res) => {
    const visibleInventory = inventory
      .filter((item) => canManageSupplier(req.user, item.supplierId))
      .map(({ id, name, stock, reorderThreshold, replenishmentQuantity, supplierId }) => ({
        id,
        name,
        stock,
        reorderThreshold,
        replenishmentQuantity,
        supplierId,
        belowReorderThreshold: stock <= reorderThreshold,
      }));

    return res.json({ data: visibleInventory });
  });

  app.post(
    "/api/inventory/:itemId/replenishments",
    requireAuthentication,
    requireInventoryRole,
    (req, res) => {
      const item = inventory.find((entry) => entry.id === req.params.itemId);
      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      if (!canManageSupplier(req.user, item.supplierId)) {
        return res.status(403).json({ error: "You cannot manage this supplier's inventory" });
      }
      if (item.stock > item.reorderThreshold) {
        return res.status(409).json({ error: "Stock is above the reorder threshold" });
      }

      const order = {
        id: randomBytes(12).toString("hex"),
        itemId: item.id,
        supplierId: item.supplierId,
        quantity: item.replenishmentQuantity,
        requestedBy: req.user.id,
        status: "pending",
      };
      replenishments.push(order);
      return res.status(201).json({ data: order });
    },
  );

  return app;
}

module.exports = { createApp };
