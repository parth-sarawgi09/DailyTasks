const express = require("express");
const { randomUUID } = require("node:crypto");

function validateWorkout(body) {
  const issues = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { issues: [{ field: "body", message: "Must be a JSON object" }] };
  }

  if (typeof body.athleteId !== "string" || !body.athleteId.trim() || body.athleteId.length > 64) {
    issues.push({ field: "athleteId", message: "Must be a non-empty string of at most 64 characters" });
  }
  if (typeof body.exercise !== "string" || !body.exercise.trim() || body.exercise.length > 100) {
    issues.push({ field: "exercise", message: "Must be a non-empty string of at most 100 characters" });
  }
  if (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 600) {
    issues.push({ field: "durationMinutes", message: "Must be an integer from 1 to 600" });
  }
  if (
    typeof body.completedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(body.completedAt) ||
    !Number.isFinite(Date.parse(body.completedAt))
  ) {
    issues.push({ field: "completedAt", message: "Must be an ISO timestamp with a timezone" });
  }
  if (!Number.isInteger(body.sets) || body.sets < 1 || body.sets > 50) {
    issues.push({ field: "sets", message: "Must be an integer from 1 to 50" });
  }
  if (!Number.isInteger(body.repsPerSet) || body.repsPerSet < 1 || body.repsPerSet > 100) {
    issues.push({ field: "repsPerSet", message: "Must be an integer from 1 to 100" });
  }
  if (typeof body.weightKg !== "number" || !Number.isFinite(body.weightKg) || body.weightKg < 0 || body.weightKg > 1000) {
    issues.push({ field: "weightKg", message: "Must be a number from 0 to 1000" });
  }

  return { issues };
}

function createApp() {
  const app = express();
  const progressByAthlete = new Map();

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

  app.post("/api/workout-sessions", (req, res, next) => {
    const { issues } = validateWorkout(req.body);
    if (issues.length) {
      const error = new Error("Workout validation failed");
      error.status = 400;
      error.details = issues;
      return next(error);
    }

    const { athleteId, exercise, durationMinutes, completedAt, sets, repsPerSet, weightKg } = req.body;
    const workout = {
      id: randomUUID(),
      athleteId: athleteId.trim(),
      exercise: exercise.trim(),
      durationMinutes,
      completedAt,
      sets,
      repsPerSet,
      weightKg,
      volumeKg: sets * repsPerSet * weightKg,
    };

    const progress = progressByAthlete.get(workout.athleteId) || {
      completedSessions: 0,
      totalDurationMinutes: 0,
      totalVolumeKg: 0,
    };
    progress.completedSessions += 1;
    progress.totalDurationMinutes += durationMinutes;
    progress.totalVolumeKg += workout.volumeKg;
    progressByAthlete.set(workout.athleteId, progress);

    res.status(201).json({ workout, progress });
  });

  app.use((req, res, next) => {
    const error = new Error("Route not found");
    error.status = 404;
    next(error);
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    const isMalformedJson = error.type === "entity.parse.failed";
    const status = isMalformedJson ? 400 : error.status || error.statusCode || 500;
    if (status >= 500) console.error(error);

    res.status(status).json({
      error: {
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
