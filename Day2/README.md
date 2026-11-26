# Food delivery order dashboard API

A small REST API for a food-delivery dashboard to list orders, inspect an order,
change its preparation/delivery status, and refresh its delivery ETA. The
included Python server is an in-memory reference implementation for trying the
contract locally; data resets when the server restarts.

## Run locally

Requires Python 3.9+ and no third-party packages.

```powershell
python .\server.py
```

The server listens on `http://localhost:8000`. The sample data contains orders
`ord-1001` and `ord-1002`.

## Endpoints

All paths are rooted at `/api/v1`. Requests and responses use
`Content-Type: application/json`. Timestamps are ISO 8601 with a timezone;
responses normalize timestamps to UTC (`Z`).

| Method and path | Purpose | Success |
| --- | --- | --- |
| `GET /orders?restaurantId=res-17&status=preparing` | List dashboard orders; both filters are optional and can be combined. | `200 OK` |
| `GET /orders/{orderId}` | Fetch an order and its current status/ETA. | `200 OK` |
| `PATCH /orders/{orderId}/status` | Advance or cancel an order. | `200 OK` |
| `PATCH /orders/{orderId}/eta` | Set a new delivery estimate. | `200 OK` |

### 1. List dashboard orders

`GET /api/v1/orders?restaurantId=res-17&status=preparing`

Response (`200 OK`):

```json
{
  "data": [
    {
      "id": "ord-1001",
      "restaurantId": "res-17",
      "customerName": "Mina Patel",
      "status": "preparing",
      "estimatedDeliveryAt": "2026-11-25T09:00:00Z",
      "updatedAt": "2026-11-25T08:30:00Z"
    }
  ],
  "count": 1
}
```

The sample server's timestamps are generated at startup; actual values will
therefore differ from this illustrative response.

### 2. Get one order

`GET /api/v1/orders/ord-1001`

Response (`200 OK`):

```json
{
  "data": {
    "id": "ord-1001",
    "restaurantId": "res-17",
    "customerName": "Mina Patel",
    "status": "preparing",
    "estimatedDeliveryAt": "2026-11-25T09:00:00Z",
    "updatedAt": "2026-11-25T08:30:00Z"
  }
}
```

### 3. Update order status

`PATCH /api/v1/orders/ord-1001/status`

Request:

```json
{
  "status": "ready_for_pickup",
  "note": "Order packed and waiting for courier"
}
```

Response (`200 OK`):

```json
{
  "data": {
    "id": "ord-1001",
    "restaurantId": "res-17",
    "customerName": "Mina Patel",
    "status": "ready_for_pickup",
    "estimatedDeliveryAt": "2026-11-25T09:00:00Z",
    "updatedAt": "2026-11-25T08:35:00Z"
  }
}
```

Valid statuses are `placed`, `confirmed`, `preparing`, `ready_for_pickup`,
`picked_up`, `delivered`, and `cancelled`. The server enforces forward
transitions: `placed → confirmed → preparing → ready_for_pickup → picked_up →
delivered`; an order can be cancelled before pickup. `note` is optional and
limited to 200 characters.

### 4. Update delivery ETA

`PATCH /api/v1/orders/ord-1001/eta`

Request:

```json
{
  "estimatedDeliveryAt": "2026-11-25T09:20:00Z",
  "reason": "Courier delayed by traffic"
}
```

Response (`200 OK`):

```json
{
  "data": {
    "id": "ord-1001",
    "restaurantId": "res-17",
    "customerName": "Mina Patel",
    "status": "preparing",
    "estimatedDeliveryAt": "2026-11-25T09:20:00Z",
    "updatedAt": "2026-11-25T08:35:00Z"
  }
}
```

`estimatedDeliveryAt` is required, must be a valid ISO 8601 timestamp with a
timezone, and must be in the future. `reason` is optional and limited to 200
characters. ETA cannot be changed after delivery or cancellation.

## Validation and errors

- Unknown orders return `404 Not Found`.
- Malformed JSON or unsupported query filters return `400 Bad Request`.
- Invalid fields or timestamps return `422 Unprocessable Content`.
- A status change that is not allowed returns `409 Conflict`.
- Every error uses this shape:

```json
{
  "error": {
    "code": "invalid_status",
    "message": "Status cannot move from ready_for_pickup to delivered.",
    "details": {
      "allowedNextStatuses": ["picked_up", "cancelled"]
    }
  }
}
```

For production, protect dashboard mutations with authentication/authorization
and persist updates in a database; the reference server intentionally omits
both.

## Flow

```text
Restaurant dashboard
    | GET /orders?restaurantId=res-17
    | GET /orders/ord-1001
    | PATCH /orders/ord-1001/status
    | PATCH /orders/ord-1001/eta
    v
Food delivery API ----> order status + delivery ETA
```

## Verification with curl

Start the server in one terminal, then run the verification script in another
terminal:

```powershell
python .\verify_curl.py
```

The script invokes `curl.exe` for all four endpoints, checks the success
responses and a `409 Conflict` response, then writes the captured transcript.
Same-status PATCH requests are treated as no-ops, so the script can be rerun
against the same in-memory server.

Captured response evidence from running these requests is in
[`evidence/curl-verification.txt`](evidence/curl-verification.txt).
