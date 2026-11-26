"""Exercise the reference API with curl.exe and save its response evidence."""

import json
from pathlib import Path
import re
import subprocess


BASE_URL = "http://localhost:8000/api/v1"
evidence = []


def request(label, method, path, expected_status, body=None):
    command = ["curl.exe", "-sS", "-i", "-X", method, BASE_URL + path]
    if body is not None:
        command.extend(
            [
                "-H",
                "Content-Type: application/json",
                "--data-binary",
                json.dumps(body, separators=(",", ":")),
            ]
        )
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError("{} failed: {}".format(label, result.stderr.strip()))
    match = re.search(r"HTTP/\S+\s+(\d{3})", result.stdout)
    if match is None or int(match.group(1)) != expected_status:
        raise AssertionError(
            "{} expected HTTP {}, got:\n{}".format(
                label, expected_status, result.stdout
            )
        )
    response_body = re.split(r"\r?\n\r?\n", result.stdout, maxsplit=1)[-1]
    parsed_body = json.loads(response_body)
    evidence.append(
        "\n--- {} (expected HTTP {}) ---\n{}\n".format(
            label, expected_status, result.stdout.strip()
        )
    )
    return parsed_body


evidence.append(
    "Food delivery API curl verification (Python reference server on localhost:8000)\n"
)

listed = request(
    "GET dashboard orders",
    "GET",
    "/orders?restaurantId=res-17",
    200,
)
assert listed["count"] >= 1
assert listed["data"][0]["id"] == "ord-1001"

order = request("GET one order", "GET", "/orders/ord-1001", 200)
assert order["data"]["id"] == "ord-1001"

error = request(
    "PATCH invalid status transition",
    "PATCH",
    "/orders/ord-1001/status",
    409,
    {"status": "delivered"},
)
assert error["error"]["code"] == "invalid_status"

updated = request(
    "PATCH order status",
    "PATCH",
    "/orders/ord-1001/status",
    200,
    {"status": "ready_for_pickup", "note": "Packed"},
)
assert updated["data"]["status"] == "ready_for_pickup"

updated = request(
    "PATCH delivery ETA",
    "PATCH",
    "/orders/ord-1001/eta",
    200,
    {
        "estimatedDeliveryAt": "2030-01-01T12:00:00Z",
        "reason": "Courier delay",
    },
)
assert updated["data"]["estimatedDeliveryAt"] == "2030-01-01T12:00:00Z"

evidence.append("\nPASS: all endpoint and error-response assertions succeeded.\n")
transcript = "".join(evidence)
output = Path("evidence")
output.mkdir(exist_ok=True)
(output / "curl-verification.txt").write_text(transcript, encoding="utf-8")
print(transcript, end="")
