# Express Middleware & Validation

A compact Express prototype for a fitness-coaching app. `POST /api/workout-sessions` records a completed workout and returns per-athlete progress analytics. The prototype keeps progress in memory; data resets when the server restarts.

## Run

```sh
npm install
npm test
npm start
```

The server listens on port `3000` by default (`PORT` can override it).

## Request examples

Valid workout:

```sh
curl.exe -i -X POST http://localhost:3000/api/workout-sessions -H "Content-Type: application/json" -d "{\"athleteId\":\"athlete-42\",\"exercise\":\"Back squat\",\"durationMinutes\":45,\"completedAt\":\"2026-11-25T18:30:00Z\",\"sets\":3,\"repsPerSet\":8,\"weightKg\":60}"
```

Example response (`201 Created`; IDs are generated):

```json
{
  "workout": {
    "id": "...",
    "athleteId": "athlete-42",
    "exercise": "Back squat",
    "durationMinutes": 45,
    "completedAt": "2026-11-25T18:30:00Z",
    "sets": 3,
    "repsPerSet": 8,
    "weightKg": 60,
    "volumeKg": 1440
  },
  "progress": {
    "completedSessions": 1,
    "totalDurationMinutes": 45,
    "totalVolumeKg": 1440
  }
}
```

Invalid workout (zero sets):

```sh
curl.exe -i -X POST http://localhost:3000/api/workout-sessions -H "Content-Type: application/json" -d "{\"athleteId\":\"athlete-42\",\"exercise\":\"Back squat\",\"durationMinutes\":45,\"completedAt\":\"2026-11-25T18:30:00Z\",\"sets\":0,\"repsPerSet\":8,\"weightKg\":60}"
```

Example response (`400 Bad Request`; request IDs are generated):

```json
{
  "error": {
    "message": "Workout validation failed",
    "details": [
      { "field": "sets", "message": "Must be an integer from 1 to 50" }
    ],
    "requestId": "..."
  }
}
```

Invalid requests do not affect progress.

Edge case: a malformed JSON body is rejected by the JSON parser and formatted by the centralized error handler as `400` with `{"error":{"message":"Request body must be valid JSON"}}`.

## Implementation note

- `src/app.js` validates required workout fields and practical bounds before calculating volume or updating in-memory totals.
- Request-ID middleware creates an `X-Request-Id` for every request; completion logs include the ID, method, path, and status.
- A final error middleware formats validation, malformed-body, and unknown-route errors consistently and includes the request ID.
- The integration tests exercise a successful workout, validation failure, and malformed JSON edge case.
