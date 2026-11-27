# Fleet Maintenance API

A small Express prototype for recording fleet vehicle maintenance and tracking
when the next service is due. Records are stored in memory and reset when the
server restarts.

## Run and verify

```powershell
npm install
npm test
npm start
```

The server listens on `http://localhost:3000` by default; set `PORT` to use a
different port.

## API

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| `POST` | `/api/vehicles/{vehicleId}/maintenance-records` | Validate and add a service record | `201 Created` |
| `GET` | `/api/vehicles/{vehicleId}/maintenance-records` | List a vehicle's records, newest first | `200 OK` |

`vehicleId` must contain 1-64 letters, numbers, underscores, or hyphens.
`serviceType` is one of `oil_change`, `tire_rotation`, `inspection`, `repair`,
or `other`. `servicedAt` and `nextDueAt` must be ISO timestamps with a timezone,
and the next due time must be later than the service time. `odometerKm` must be
a number from 0 to 2,000,000. Optional `notes` are limited to 500 characters.

The API marks each new record `overdue` if its due date has passed, `due_soon`
if it is within 30 days, and `current` otherwise.

### Request flow

```text
Fleet client
    | POST /api/vehicles/TRUCK-204/maintenance-records
    v
Request ID + access log middleware
    v
JSON parser -> field validation -> in-memory record + due status
    | success: 201 JSON with X-Request-Id
    | failure: centralized JSON error with requestId
    v
Fleet client
```

### Valid request

```powershell
curl.exe -i -X POST http://localhost:3000/api/vehicles/TRUCK-204/maintenance-records `
  -H "Content-Type: application/json" `
  -d '{"serviceType":"oil_change","servicedAt":"2026-11-01T10:00:00Z","nextDueAt":"2027-05-01T10:00:00Z","odometerKm":48250,"notes":"Replaced oil and filter"}'
```

Example response (`201 Created`; IDs and request IDs are generated):

```json
{
  "data": {
    "id": "...",
    "vehicleId": "TRUCK-204",
    "serviceType": "oil_change",
    "servicedAt": "2026-11-01T10:00:00.000Z",
    "nextDueAt": "2027-05-01T10:00:00.000Z",
    "odometerKm": 48250,
    "notes": "Replaced oil and filter",
    "dueStatus": "current"
  }
}
```

### Invalid request

An odometer below zero and a due date before service return `422 Unprocessable
Content`; the validation response does not create a record.

```powershell
curl.exe -i -X POST http://localhost:3000/api/vehicles/TRUCK-204/maintenance-records `
  -H "Content-Type: application/json" `
  -d '{"serviceType":"oil_change","servicedAt":"2026-11-01T10:00:00Z","nextDueAt":"2026-10-01T10:00:00Z","odometerKm":-1}'
```

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Maintenance record validation failed",
    "details": [
      { "field": "nextDueAt", "message": "Must be later than servicedAt" },
      { "field": "odometerKm", "message": "Must be a number from 0 to 2000000" }
    ],
    "requestId": "..."
  }
}
```

Malformed JSON returns `400`; unknown routes return `404`. The centralized
handler uses the same error envelope and request ID for each error.

## Middleware and verification

- Request-ID middleware attaches `X-Request-Id` to every response and logs the
  request ID, method, path, and status on completion.
- Route validation runs before data is stored. The final error middleware
  formats validation, malformed JSON, unknown route, and server errors.
- `npm test` exercises valid record creation, invalid input and no-write
  behavior, due-state calculation, malformed JSON, and unknown routes.
- The captured live HTTP verification is in [`evidence/verification.txt`](evidence/verification.txt).

This in-memory prototype is for demonstration; production use should add
authentication, durable storage, and authorization for vehicle records.
