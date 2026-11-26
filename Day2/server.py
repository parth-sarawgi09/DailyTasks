"""Dependency-free reference API for the food delivery dashboard."""

from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import re
from urllib.parse import parse_qs, urlparse


def utc_now():
    return datetime.now(timezone.utc)


def isoformat(value):
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


ORDERS = {
    "ord-1001": {
        "id": "ord-1001",
        "restaurantId": "res-17",
        "customerName": "Mina Patel",
        "status": "preparing",
        "estimatedDeliveryAt": isoformat(utc_now() + timedelta(minutes=30)),
        "updatedAt": isoformat(utc_now()),
    },
    "ord-1002": {
        "id": "ord-1002",
        "restaurantId": "res-17",
        "customerName": "Noah Kim",
        "status": "confirmed",
        "estimatedDeliveryAt": isoformat(utc_now() + timedelta(minutes=45)),
        "updatedAt": isoformat(utc_now()),
    },
}

STATUSES = (
    "placed",
    "confirmed",
    "preparing",
    "ready_for_pickup",
    "picked_up",
    "delivered",
    "cancelled",
)
NEXT_STATUSES = {
    "placed": ("confirmed", "cancelled"),
    "confirmed": ("preparing", "cancelled"),
    "preparing": ("ready_for_pickup", "cancelled"),
    "ready_for_pickup": ("picked_up", "cancelled"),
    "picked_up": ("delivered",),
    "delivered": (),
    "cancelled": (),
}
ORDER_PATH = re.compile(r"^/api/v1/orders/([^/]+)$")
UPDATE_PATH = re.compile(r"^/api/v1/orders/([^/]+)/(status|eta)$")


class APIError(Exception):
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, body):
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def send_error_json(self, error):
        self.send_json(
            error.status,
            {
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "details": error.details,
                }
            },
        )

    def read_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            raise APIError(400, "malformed_json", "Request body must be valid JSON.")
        if not isinstance(body, dict):
            raise APIError(400, "invalid_body", "Request body must be a JSON object.")
        return body

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/v1/orders":
                self.list_orders(parse_qs(parsed.query))
                return

            match = ORDER_PATH.fullmatch(parsed.path)
            if match:
                self.get_order(match.group(1))
                return
            raise APIError(404, "not_found", "Endpoint not found.")
        except APIError as error:
            self.send_error_json(error)

    def list_orders(self, query):
        allowed = {"restaurantId", "status"}
        if set(query) - allowed:
            raise APIError(
                400,
                "invalid_query",
                "Only restaurantId and status filters are supported.",
                {"allowedFilters": sorted(allowed)},
            )
        if any(len(values) != 1 for values in query.values()):
            raise APIError(400, "invalid_query", "Each filter can be supplied once.")
        status = query.get("status", [None])[0]
        if status is not None and status not in STATUSES:
            raise APIError(
                422,
                "invalid_status",
                "Status filter is not supported.",
                {"allowedStatuses": list(STATUSES)},
            )
        orders = [
            order.copy()
            for order in ORDERS.values()
            if (not query.get("restaurantId") or
                order["restaurantId"] == query["restaurantId"][0])
            and (status is None or order["status"] == status)
        ]
        self.send_json(200, {"data": orders, "count": len(orders)})

    def get_order(self, order_id):
        order = ORDERS.get(order_id)
        if order is None:
            raise APIError(404, "order_not_found", "Order was not found.")
        self.send_json(200, {"data": order.copy()})

    def do_PATCH(self):
        try:
            match = UPDATE_PATH.fullmatch(urlparse(self.path).path)
            if not match:
                raise APIError(404, "not_found", "Endpoint not found.")
            order_id, field = match.groups()
            order = ORDERS.get(order_id)
            if order is None:
                raise APIError(404, "order_not_found", "Order was not found.")
            payload = self.read_body()
            if field == "status":
                self.update_status(order, payload)
            else:
                self.update_eta(order, payload)
        except APIError as error:
            self.send_error_json(error)

    def update_status(self, order, payload):
        if set(payload) - {"status", "note"} or "status" not in payload:
            raise APIError(
                422,
                "invalid_fields",
                "Provide status and optionally note; no other fields are accepted.",
            )
        status = payload["status"]
        note = payload.get("note")
        if status not in STATUSES:
            raise APIError(
                422,
                "invalid_status",
                "Status is not supported.",
                {"allowedStatuses": list(STATUSES)},
            )
        if note is not None and (not isinstance(note, str) or len(note) > 200):
            raise APIError(
                422, "invalid_note", "Note must be a string of at most 200 characters."
            )
        if status == order["status"]:
            self.send_json(200, {"data": order.copy()})
            return
        allowed = NEXT_STATUSES[order["status"]]
        if status not in allowed:
            raise APIError(
                409,
                "invalid_status",
                "Status cannot move from {} to {}.".format(order["status"], status),
                {"allowedNextStatuses": list(allowed)},
            )
        order["status"] = status
        order["updatedAt"] = isoformat(utc_now())
        self.send_json(200, {"data": order.copy()})

    def update_eta(self, order, payload):
        if set(payload) - {"estimatedDeliveryAt", "reason"} or (
            "estimatedDeliveryAt" not in payload
        ):
            raise APIError(
                422,
                "invalid_fields",
                "Provide estimatedDeliveryAt and optionally reason; no other fields are accepted.",
            )
        reason = payload.get("reason")
        if reason is not None and (not isinstance(reason, str) or len(reason) > 200):
            raise APIError(
                422,
                "invalid_reason",
                "Reason must be a string of at most 200 characters.",
            )
        if order["status"] in ("delivered", "cancelled"):
            raise APIError(
                409,
                "eta_locked",
                "ETA cannot be changed after delivery or cancellation.",
            )
        value = payload["estimatedDeliveryAt"]
        if not isinstance(value, str):
            raise APIError(422, "invalid_eta", "ETA must be an ISO 8601 timestamp.")
        try:
            eta = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            raise APIError(422, "invalid_eta", "ETA must be an ISO 8601 timestamp.")
        if eta.tzinfo is None:
            raise APIError(
                422, "invalid_eta", "ETA must include a timezone offset."
            )
        if eta <= utc_now():
            raise APIError(422, "invalid_eta", "ETA must be in the future.")
        order["estimatedDeliveryAt"] = isoformat(eta)
        order["updatedAt"] = isoformat(utc_now())
        self.send_json(200, {"data": order.copy()})

    def log_message(self, format_string, *args):
        print("{} - {}".format(self.address_string(), format_string % args))


if __name__ == "__main__":
    print("Food delivery API listening on http://localhost:8000")
    HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
