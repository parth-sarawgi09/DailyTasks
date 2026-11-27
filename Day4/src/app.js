const express = require("express");
const { randomUUID } = require("node:crypto");

const serviceTypes = new Set(["oil_change", "tire_rotation", "inspection", "repair", "other"]);
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isTimestamp(value) {
  if (typeof value !== "string" || !timestampPattern.test(value) || !Number.isFinite(Date.parse(value))) {
    return false;
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function isValidVehicleId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

function dueStatus(nextDueAt, now = Date.now()) {
  const dueAt = Date.parse(nextDueAt);
  if (dueAt < now) return "overdue";
  if (dueAt <= now + 30 * 24 * 60 * 60 * 1000) return "due_soon";
  return "current";
}

function createError(message, status, code, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function validateMaintenanceRecord(req, res, next) {
  const body = req.body;
  const issues = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    issues.push({ field: "body", message: "Must be a JSON object" });
  } else {
    if (!serviceTypes.has(body.serviceType)) {
      issues.push({
        field: "serviceType",
        message: `Must be one of: ${Array.from(serviceTypes).join(", ")}`,
      });
    }
    if (!isTimestamp(body.servicedAt)) {
      issues.push({ field: "servicedAt", message: "Must be an ISO timestamp with a timezone" });
    }
    if (!isTimestamp(body.nextDueAt)) {
      issues.push({ field: "nextDueAt", message: "Must be an ISO timestamp with a timezone" });
    } else if (isTimestamp(body.servicedAt) && Date.parse(body.nextDueAt) <= Date.parse(body.servicedAt)) {
      issues.push({ field: "nextDueAt", message: "Must be later than servicedAt" });
    }
    if (typeof body.odometerKm !== "number" || !Number.isFinite(body.odometerKm) || body.odometerKm < 0 || body.odometerKm > 2000000) {
      issues.push({ field: "odometerKm", message: "Must be a number from 0 to 2000000" });
    }
    if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 500)) {
      issues.push({ field: "notes", message: "Must be a string of at most 500 characters" });
    }
  }

  if (issues.length) {
    return next(createError("Maintenance record validation failed", 422, "validation_failed", issues));
  }

  next();
}

function createApp() {
  const app = express();
  const recordsByVehicle = new Map();

  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    res.on("finish", () => {
      console.log(JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
      }));
    });
    next();
  });

  app.use(express.json({ limit: "16kb" }));

  app.param("vehicleId", (req, res, next, vehicleId) => {
    if (!isValidVehicleId(vehicleId)) {
      return next(createError("vehicleId must be 1-64 letters, numbers, underscores, or hyphens", 400, "invalid_vehicle_id"));
    }
    next();
  });

  app.post("/api/vehicles/:vehicleId/maintenance-records", validateMaintenanceRecord, (req, res) => {
    const vehicleId = req.params.vehicleId;
    const record = {
      id: randomUUID(),
      vehicleId,
      serviceType: req.body.serviceType,
      servicedAt: new Date(req.body.servicedAt).toISOString(),
      nextDueAt: new Date(req.body.nextDueAt).toISOString(),
      odometerKm: req.body.odometerKm,
      ...(req.body.notes !== undefined ? { notes: req.body.notes.trim() } : {}),
      dueStatus: dueStatus(req.body.nextDueAt),
    };

    const records = recordsByVehicle.get(vehicleId) || [];
    records.unshift(record);
    recordsByVehicle.set(vehicleId, records);
    res.status(201).json({ data: record });
  });

  app.get("/api/vehicles/:vehicleId/maintenance-records", (req, res) => {
    const records = recordsByVehicle.get(req.params.vehicleId) || [];
    res.json({ data: records, count: records.length });
  });

  app.use((req, res, next) => {
    next(createError("Route not found", 404, "not_found"));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    const isMalformedJson = error.type === "entity.parse.failed";
    const status = isMalformedJson ? 400 : error.status || error.statusCode || 500;
    if (status >= 500) console.error(error);

    res.status(status).json({
      error: {
        code: isMalformedJson ? "invalid_json" : error.code || "internal_error",
        message: isMalformedJson
          ? "Request body must be valid JSON"
          : status === 500
            ? "Internal server error"
            : error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId: req.requestId,
      },
    });
  });

  return app;
}

module.exports = { createApp };
