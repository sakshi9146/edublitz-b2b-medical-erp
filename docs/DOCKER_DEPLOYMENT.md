# Docker Deployment Guide

Run the **three backend APIs** with Docker Compose. **MongoDB lives on Atlas** (no DB container). The **React app is built for S3 + CloudFront** and is not part of this compose file.

---

## Prerequisites

- Docker Desktop 4.x+ (or Docker Engine 24+)
- Docker Compose v2 (`docker compose`)
- MongoDB Atlas cluster with three databases (or URI paths): `users_db`, `products_db`, `orders_db`
- Atlas **Network Access** allowing the host running Docker (or `0.0.0.0/0` for quick tests)

---

## Step 1 — Configure environment

```bash
cd docker
cp .env.example .env
```

Edit `.env` and set:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI_*` | Full Atlas SRV URIs for users, products, and orders DBs |
| `JWT_SECRET` | Same Base64 secret as documented in [MANUAL_DEPLOYMENT.md](MANUAL_DEPLOYMENT.md) |
| `CORS_ALLOWED_ORIGINS` | For production: your **CloudFront or S3 website URL** (e.g. `https://d123456.cloudfront.net`). Use `*` only for local demos |

---

## Step 2 — Build images

```bash
# From project root
docker compose -f docker/docker-compose.yml build

# Single service
docker compose -f docker/docker-compose.yml build user-service
```

---

## Step 3 — Start the APIs

```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f
```

Check health:

```bash
docker compose -f docker/docker-compose.yml ps
```

Expected services:

| Container | Ports |
|-----------|--------|
| med-erp-user-service | 8081 |
| med-erp-product-service | 8082 |
| med-erp-order-service | 8083 |

---

## Step 4 — Frontend (S3 + CloudFront)

Compose does **not** run the UI. For static hosting:

1. Set `frontend/.env.production` (or build-time env) so `VITE_USER_SERVICE_URL`, `VITE_PRODUCT_SERVICE_URL`, and `VITE_ORDER_SERVICE_URL` point at your **public API base URLs** (ALB, CloudFront API path, or host IPs).
2. Build: `cd frontend && npm ci && npm run build`
3. Upload `frontend/dist` to your **S3** bucket and serve via **CloudFront** (and optionally WAF).

Local SPA dev against these containers: `npm run dev` with Vite proxy to `localhost:8081–8083` still works.

---

## API entry points (after compose)

| URL | Description |
|-----|-------------|
| http://localhost:8081/api/v1/swagger-ui.html | User Service |
| http://localhost:8082/api/v1/swagger-ui.html | Product Service |
| http://localhost:8083/api/v1/swagger-ui.html | Order Service |

---

## Useful commands

```bash
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml restart user-service
docker compose -f docker/docker-compose.yml logs -f order-service
docker exec -it med-erp-user-service sh
```

---

## Building for production (ECR push)

```bash
export ECR_REGISTRY="123456789012.dkr.ecr.us-east-1.amazonaws.com"
export IMAGE_TAG="v1.0.0"

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_REGISTRY

for svc in user-service product-service order-service; do
  docker build -t $ECR_REGISTRY/med-erp/$svc:$IMAGE_TAG ./$svc/
  docker push $ECR_REGISTRY/med-erp/$svc:$IMAGE_TAG
done
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Service unhealthy | `docker compose -f docker/docker-compose.yml logs <service>` |
| Mongo timeout / auth | Confirm Atlas URI, user, password, and **Network Access** |
| CORS from CloudFront | Set `CORS_ALLOWED_ORIGINS` to your SPA origin (not `*` in production) |
| Port conflict | Change host ports in `docker/docker-compose.yml` |
| Build fails | Ensure Docker has enough RAM; use `DOCKER_BUILDKIT=1` |
