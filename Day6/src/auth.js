const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const jwt = require("jsonwebtoken");

const scrypt = promisify(scryptCallback);
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const JWT_ISSUER = "day6-inventory";
const JWT_AUDIENCE = "inventory-api";
const ACCESS_TOKEN_LIFETIME = "15m";

function assertPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new Error("Passwords must contain 12-128 characters");
  }
}

async function deriveKey(password, salt) {
  return scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
}

async function hashPassword(password) {
  assertPassword(password);
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt);
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("hex"),
    key.toString("hex"),
  ].join("$");
}

async function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || password.length > 128 || typeof storedHash !== "string") {
    return false;
  }

  const [algorithm, cost, blockSize, parallelization, saltHex, keyHex, ...extra] = storedHash.split("$");
  if (
    algorithm !== "scrypt"
    || Number(cost) !== SCRYPT_COST
    || Number(blockSize) !== SCRYPT_BLOCK_SIZE
    || Number(parallelization) !== SCRYPT_PARALLELIZATION
    || !/^[a-f0-9]{32}$/i.test(saltHex || "")
    || !/^[a-f0-9]{128}$/i.test(keyHex || "")
    || extra.length > 0
  ) {
    return false;
  }

  const expectedKey = Buffer.from(keyHex, "hex");
  const actualKey = await deriveKey(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actualKey, expectedKey);
}

function signAccessToken(user, secret) {
  return jwt.sign(
    {},
    secret,
    {
      algorithm: "HS256",
      subject: user.id,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ACCESS_TOKEN_LIFETIME,
    },
  );
}

function verifyAccessToken(token, secret) {
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (!payload || typeof payload !== "object" || typeof payload.sub !== "string") {
    throw new Error("Invalid token subject");
  }
  return payload.sub;
}

module.exports = {
  ACCESS_TOKEN_LIFETIME,
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
};
