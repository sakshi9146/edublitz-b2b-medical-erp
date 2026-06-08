# Manual Deployment Guide (No Docker/Kubernetes)

Run all 3 backend services and the frontend directly on your local machine.

---

## Prerequisites

| Tool        | Minimum Version | Install                              |
|-------------|-----------------|--------------------------------------|
| Java JDK    | 17              | `brew install openjdk@17`            |
| Maven       | 3.9             | `brew install maven`                 |
| Node.js     | 18              | `brew install node` or nvm           |
| MongoDB     | 7.0             | Local install or MongoDB Atlas free  |

---

## Step 1 — MongoDB Setup

### Option A: Local MongoDB
```bash
# macOS
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

### Option B: MongoDB Atlas (Recommended)
1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create 3 databases: `users_db`, `products_db`, `orders_db`
3. Create a database user with readWrite access
4. Copy the connection URI

---

## Step 2 — Shared JWT secret (all backends)

```bash
export JWT_SECRET="$(openssl rand -base64 32)"
echo "$JWT_SECRET"   # copy into each service `.env` as JWT_SECRET=
```

---

## Step 3 — User Service (Port 8081)

```bash
cd user-service
cp .env.example .env
# Edit .env — MONGODB_URI and JWT_SECRET (same secret for all three services).

export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17 2>/dev/null || true)}"
mvn clean package -DskipTests

set -a && [ -f .env ] && . ./.env; set +a
java -jar target/user-service-1.0.0.jar
```

**Verify:** `curl http://localhost:8081/api/v1/actuator/health`

**Swagger UI:** http://localhost:8081/api/v1/swagger-ui.html

---

## Step 4 — Product Service (Port 8082)

(Re-use the same `JWT_SECRET` from Step 2.)

```bash
cd product-service
cp .env.example .env
# Edit .env — same JWT_SECRET; MONGODB_URI for products_db

export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17 2>/dev/null || true)}"
mvn clean package -DskipTests

set -a && [ -f .env ] && . ./.env; set +a
java -jar target/product-service-1.0.0.jar
```

**Verify:** `curl http://localhost:8082/api/v1/actuator/health`

---

## Step 5 — Order Service (Port 8083)

(Re-use the same `JWT_SECRET` from Step 2.)

```bash
cd order-service
cp .env.example .env
# Edit .env — JWT_SECRET, MONGODB_URI, PRODUCT_SERVICE_URL, USER_SERVICE_URL (localhost)

export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17 2>/dev/null || true)}"
mvn clean package -DskipTests

set -a && [ -f .env ] && . ./.env; set +a
java -jar target/order-service-1.0.0.jar
```

**Verify:** `curl http://localhost:8083/api/v1/actuator/health`

---

## Step 6 — Frontend (Port 5173)

The app uses **HashRouter** (`/#/…` paths) so it works on static hosts without server rewrite rules.

```bash
cd frontend
npm install
# Default: Vite proxies /api/* to localhost — see vite.config.ts. Optional: .env.local with VITE_PROXY_API_HOST.
npm run dev
```

**Open:** [http://localhost:5173/#/login](http://localhost:5173/#/login)

---

## Step 7 — Bootstrap Data

Use the **Organization ID** values returned by the API (also visible in **Admin → Organizations** in the UI) when registering users.

### Create an Organization (via API)
```bash
# First, create an organization
curl -X POST http://localhost:8081/api/v1/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "City General Hospital",
    "registrationNumber": "HOSP-001",
    "type": "HOSPITAL",
    "address": {"street": "123 Main St","city": "Mumbai","state": "MH","pincode": "400001","country": "India"},
    "contactEmail": "admin@cityhospital.com",
    "contactPhone": "+91-9876543210",
    "active": true
  }'
# Note the returned `id`
```

### Register an Admin User
```bash
curl -X POST http://localhost:8081/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Admin",
    "lastName": "User",
    "email": "admin@cityhospital.com",
    "password": "Admin@1234",
    "role": "ADMIN",
    "organizationId": "<org-id-from-above>"
  }'
```

---

## Service URL Summary

| Service         | URL                                      |
|-----------------|------------------------------------------|
| User Service    | http://localhost:8081/api/v1             |
| Product Service | http://localhost:8082/api/v1             |
| Order Service   | http://localhost:8083/api/v1             |
| Frontend        | http://localhost:5173/#/ (HashRouter)   |
| User Swagger    | http://localhost:8081/api/v1/swagger-ui.html |
| Product Swagger | http://localhost:8082/api/v1/swagger-ui.html |
| Order Swagger   | http://localhost:8083/api/v1/swagger-ui.html |

---

## Troubleshooting

| Issue                              | Fix |
|------------------------------------|-----|
| Port already in use                | `lsof -ti:8081 \| xargs kill -9` |
| MongoDB connection refused       | Check MongoDB is running: `brew services list` |
| JWT validation fails across svcs   | Same `JWT_SECRET` everywhere; value must be **valid Base64** (see `user-service` `JwtService`: `Decoders.BASE64.decode`). Generate: `openssl rand -base64 32`. |
| SPA 404 on refresh                 | Use hash URLs (`/#/…`) or serve `index.html` for all routes. |
| Order service can't reach products | Check `PRODUCT_SERVICE_URL` |
| Approve order fails (stock)        | Add **Inventory** batches so **available** (sellable) covers line quantities. |
| Maven / Lombok compile errors      | Point `JAVA_HOME` at **JDK 17** before `mvn` (macOS: `/usr/libexec/java_home -v 17`). |

### Demo checklist

1. Create distributor + hospital orgs; register users with the returned **organization IDs**.
2. Add **products** and **Inventory → Add stock (batch)** for each SKU.
3. Hospital places an order for that distributor org.
4. Distributor approves (reserves stock) → dispatch → hospital confirms delivery.
