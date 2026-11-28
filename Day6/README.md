# Inventory manager authentication

This Express API demonstrates JWT login and supplier-scoped stock replenishment.
Accounts are provisioned from environment variables at startup; there is no
public registration endpoint. Users and replenishment orders are held in memory
for this exercise and reset when the server restarts.

## Setup

Requires Node.js 18 or newer. From `Day6`:

```powershell
npm install
npm test

$env:JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
$env:INVENTORY_MANAGER_EMAIL = Read-Host "Inventory manager email"
$env:INVENTORY_MANAGER_PASSWORD = Read-Host "Inventory manager password (12-128 characters)"
$env:INVENTORY_MANAGER_SUPPLIER_IDS = "supplier-101"
npm start
```

The server listens on port 3000 by default; set `$env:PORT` to change it. To
provision an administrator, set both `$env:ADMIN_EMAIL` and
`$env:ADMIN_PASSWORD` before starting. The server hashes configured passwords
with a random salt and never stores plaintext passwords. Do not commit real
secrets or `.env` files.

## Flow and decisions

1. `POST /api/auth/login` checks the submitted email/password against the
   configured account. Invalid credentials share one response. Passwords are
   hashed with Node's scrypt (`N=16384`, `r=8`, `p=1`, 16-byte random salt), and
   compared with a constant-time byte comparison.
2. A successful login returns an HS256 JWT with a 15-minute expiry, issuer,
   audience, and only the account id as `sub`. `JWT_SECRET` is required and
   must contain at least 32 bytes; there is no committed or built-in secret.
3. Send it as `Authorization: Bearer <accessToken>` to protected inventory
   endpoints. The API verifies the signature, algorithm, issuer, audience, and
   expiry, then loads the current user from the server-side account store so a
   stale token does not preserve a changed role.
4. `GET /api/inventory` and
   `POST /api/inventory/{itemId}/replenishments` require the
   `inventory_manager` or `admin` role. Managers see and replenish only items
   belonging to their configured `supplierIds`; admins may access all suppliers.
   Replenishment orders are accepted only when stock is at or below the item's
   reorder threshold.

Example request:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login `
  -ContentType "application/json" `
  -Body (@{ email = $env:INVENTORY_MANAGER_EMAIL; password = $env:INVENTORY_MANAGER_PASSWORD } | ConvertTo-Json)
$token = $login.data.accessToken
Invoke-RestMethod -Uri http://localhost:3000/api/inventory `
  -Headers @{ Authorization = "Bearer $token" }
```

## Threat note

A stolen bearer token can be replayed until its 15-minute expiry. Deploy behind
HTTPS, keep the signing key in a secret manager, avoid browser local storage for
tokens, and add login rate limiting, key rotation/revocation, and durable account
storage before production. This demo intentionally has no refresh-token flow.

## Verification

`npm test` checks salted password hashing, generic invalid-login behavior,
missing-token and role denial, supplier ownership, the stock threshold,
administrator access, and expired-token rejection.
