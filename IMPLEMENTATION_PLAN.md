# Observability Playground API — Implementation Plan

## Overview

A 10-phase build ordered so that each phase produces something demoable or testable before moving to the next. Phases 1–4 are the core application; phases 5–10 are infrastructure, monitoring, and docs.

---

## Phase 1 — Project Scaffold

**Goal:** A running Express server with health/ready/version endpoints and structured logging.

### Tasks
- [ ] Install dependencies: `pino`, `zod`, `prom-client`, `uuid`
- [ ] Install dev deps: `vitest`, `supertest`, `@types/pino`, `@types/uuid`
- [ ] Create `src/config.ts` — parse and validate all env vars with `zod`
- [ ] Create `src/app.ts` — Express app factory (no `listen` call, for testability)
- [ ] Create `src/server.ts` — calls `app.listen`, logs startup message, handles uncaught exceptions
- [ ] Implement `GET /health` — always `200`, no dependency checks
- [ ] Implement `GET /ready` — `503` during `STARTUP_GRACE_MS`, then `200`
- [ ] Implement `GET /version` — returns `{ version, commit, buildTime }`
- [ ] Add FR-5.1 Request ID middleware (`uuid` → `X-Request-ID` header)
- [ ] Add FR-5.5 Body parser (`express.json()`, 1 MB limit)
- [ ] Add FR-5.4 Error handler middleware (consistent JSON shape, no stack traces in prod)
- [ ] Add FR-5.3 Structured logging middleware (`pino` — method, path, status, durationMs, requestId)
- [ ] Add FR-5.6 Graceful shutdown (`SIGTERM`/`SIGINT`, 10s timeout)
- [ ] Add uncaught exception + unhandled rejection handlers → `process.exit(1)`

### Acceptance
- `npm run dev` starts on port 3000
- `curl /health` → `200`
- `curl /ready` → `503` for first 5s, then `200`
- Logs are JSON

---

## Phase 2 — User CRUD (FR-1)

**Goal:** A fully working in-memory REST API for the `user` resource.

### Tasks
- [ ] Create `src/types/user.ts` — `User` interface (id, name, email, createdAt)
- [ ] Create `src/store/userStore.ts` — `Map<string, User>`, CRUD methods, seed 3–5 users at startup
- [ ] Create `src/routes/users.ts` — all 5 endpoints (GET list, GET one, POST, PUT, DELETE)
- [ ] Use `zod` schema to validate POST/PUT request bodies — return `400` on invalid
- [ ] Return correct status codes per spec (200, 201, 204, 404, 400)
- [ ] Wire routes into `app.ts`

### Acceptance
- All 5 endpoints work via `curl`
- `POST` with invalid body returns `400` with error shape
- `GET /api/v1/users/:id` with unknown id returns `404`

---

## Phase 3 — Metrics (FR-4 + FR-5.2)

**Goal:** `/metrics` endpoint serving all required Prometheus metrics.

### Tasks
- [ ] Install `prom-client`
- [ ] Create `src/metrics/registry.ts` — single `Registry` instance, `collectDefaultMetrics`
- [ ] Create `src/metrics/httpMetrics.ts` — define all 5 custom HTTP metrics:
  - `http_requests_total` (Counter, labels: method/route/status_code)
  - `http_request_duration_seconds` (Histogram, custom buckets)
  - `http_request_size_bytes` (Summary)
  - `http_response_size_bytes` (Summary)
  - `http_active_requests` (Gauge)
- [ ] Add business metrics:
  - `app_users_total` (Gauge — updated on every user mutation)
  - `app_info` (Gauge, labels: version/node_version)
  - `app_startup_timestamp_seconds` (Gauge — set once at startup)
- [ ] Add FR-5.2 metrics middleware — intercepts every request, records counter + histogram + gauge
- [ ] Implement route normalization (use `req.route?.path` to avoid cardinality explosion)
- [ ] Implement `GET /metrics` — respects `METRICS_ENABLED` env var
- [ ] Wire metrics middleware into `app.ts` (before routes)

### Acceptance
- `curl /metrics` returns Prometheus text format
- `http_requests_total`, `http_request_duration_seconds` appear after hitting any endpoint
- `app_users_total` reflects actual user count
- Route label is `/api/v1/users/:id`, not `/api/v1/users/abc-123`

---

## Phase 4 — Chaos Endpoints (FR-3)

**Goal:** All 7 chaos/simulation endpoints working, guarded by `CHAOS_ENABLED`.

### Tasks
- [ ] Create `src/chaos/state.ts` — readiness flag (`isReady`), leaked buffer array
- [ ] Create `src/routes/admin.ts` — all 7 endpoints:
  - `GET /api/v1/admin/slow?ms=2000` — `setTimeout`, max 30000ms, abort on client disconnect
  - `GET /api/v1/admin/cpu-burn?ms=1000&intensity=1` — `setImmediate` busy-loop, 1–10 workers
  - `POST /api/v1/admin/crash` — respond `200`, then `process.exit(1)` on next tick
  - `POST /api/v1/admin/toggle-ready` — flips readiness state, returns new state
  - `GET /api/v1/admin/error?code=500&rate=1.0` — probabilistic error response
  - `GET /api/v1/admin/leak?mb=50` — allocates buffer, holds in state
  - `POST /api/v1/admin/reset` — clears readiness flag + leaked buffers
- [ ] Guard all admin routes with `CHAOS_ENABLED` middleware — `404` if disabled
- [ ] Connect `isReady` flag from `state.ts` to `/ready` endpoint
- [ ] Validate `ms`, `intensity`, `code`, `rate`, `mb` params with `zod`
- [ ] Wire admin routes into `app.ts`

### Acceptance
- `curl /api/v1/admin/slow?ms=2000` takes ~2s to respond
- `POST /api/v1/admin/toggle-ready` makes `/ready` flip between 200 and 503
- `POST /api/v1/admin/crash` kills the process
- With `CHAOS_ENABLED=false`, all `/admin/*` routes return `404`

---

## Phase 5 — Containerization

**Goal:** A production-ready Docker image under 150 MB running as non-root.

### Tasks
- [ ] Create multi-stage `Dockerfile`:
  - Stage 1 (`builder`): `node:20-alpine`, install all deps, compile TypeScript (`tsc`)
  - Stage 2 (`runtime`): `node:20-alpine`, copy `dist/` + `node_modules` (prod only), set `USER node`
- [ ] Create `.dockerignore` (exclude `node_modules`, `src`, `tests`, `.git`)
- [ ] Expose port `3000`
- [ ] Set `NODE_ENV=production` in runtime stage
- [ ] Verify image size < 150 MB
- [ ] Verify `docker run` starts cleanly and `/health` responds

### Acceptance
- `docker build` succeeds
- `docker run -p 3000:3000 <image>` serves all endpoints
- `docker inspect` shows non-root user
- Image size < 150 MB

---

## Phase 6 — Kubernetes Manifests (`/k8s`)

**Goal:** Full K8s deployment with probes, resource limits, and autoscaling.

### Tasks
- [ ] `namespace.yaml` — dedicated namespace `observability-playground`
- [ ] `configmap.yaml` — non-secret env vars (PORT, LOG_LEVEL, STARTUP_GRACE_MS, etc.)
- [ ] `deployment.yaml`:
  - 2 replicas
  - Liveness probe: `GET /health`, delay 5s, period 10s, failureThreshold 3
  - Readiness probe: `GET /ready`, delay 3s, period 5s, failureThreshold 2
  - Resource requests: 100m CPU / 128Mi memory
  - Resource limits: 500m CPU / 256Mi memory
  - `envFrom` referencing ConfigMap
- [ ] `service.yaml` — ClusterIP, port 80 → 3000
- [ ] `hpa.yaml` — HPA targeting 70% CPU, min 2 / max 10 replicas
- [ ] `servicemonitor.yaml` — Prometheus Operator ServiceMonitor scraping `/metrics`
- [ ] `ingress.yaml` (optional) — external access for demos
- [ ] Test with `kubectl apply -f k8s/`

### Acceptance
- `kubectl get pods` shows 2 running pods
- `kubectl describe hpa` shows CPU target
- Probes passing (no restarts on healthy pod)

---

## Phase 7 — Prometheus Alerting Rules (`/monitoring`)

**Goal:** All 5 alerting rules defined and loadable by Prometheus.

### Tasks
- [ ] Create `monitoring/prometheus-rules.yaml` with all 5 alerts:
  - `HighErrorRate` (critical) — 5xx rate > 5%
  - `HighLatencyP95` (warning) — P95 > 1s
  - `PodDown` (critical) — target unreachable
  - `HighMemoryUsage` (warning) — RSS > 200 MB
  - `EventLoopLag` (warning) — event loop lag > 100ms
- [ ] Add `for:` duration to each rule (e.g., 5m for latency, 1m for pod down)
- [ ] Validate rules with `promtool check rules`

### Acceptance
- Rules load without errors in Prometheus UI
- Each rule can be manually triggered via chaos endpoints

---

## Phase 8 — Grafana Dashboard (`/monitoring`)

**Goal:** An importable dashboard JSON showing all 10 required panels.

### Tasks
- [ ] Create `monitoring/grafana-dashboard.json` with panels:
  1. Request rate (RPS) by route
  2. Error rate % (5xx / total)
  3. Latency P50 / P95 / P99
  4. Active requests gauge
  5. CPU usage per pod
  6. Memory usage per pod
  7. Event loop lag
  8. Pod up/down status
  9. Top 5 slowest routes
  10. Chaos endpoint invocation count
- [ ] Create `monitoring/README.md` — Prometheus + Grafana setup instructions

### Acceptance
- Dashboard imports cleanly in Grafana
- All panels show data within 30s of traffic hitting the app

---

## Phase 9 — Load Testing (`/loadtest`)

**Goal:** A script that generates sustained mixed traffic for at least 5 minutes.

### Tasks
- [ ] Choose tool: `k6` (recommended) or `autocannon`
- [ ] Write script with traffic mix:
  - 90% normal CRUD requests (GET/POST/PUT/DELETE users)
  - 5% slow requests (`/admin/slow?ms=500`)
  - 5% error requests (`/admin/error?code=500`)
- [ ] Target: steady RPS for 5+ minutes
- [ ] Add `loadtest/README.md` with run instructions

### Acceptance
- Script runs for 5 minutes without crashing
- P95 latency visibly spikes in Grafana during slow traffic
- Error rate panel shows ~5% errors

---

## Phase 10 — Documentation

**Goal:** Complete reference docs for every component.

### Tasks
- [ ] `README.md` — prerequisites, local setup, `npm run dev`, Docker run, K8s deploy
- [ ] `METRICS.md` — table of every metric: name, type, labels, description, example PromQL
- [ ] `RUNBOOK.md` — per-alert runbook: what triggered it, what to check, how to resolve
- [ ] `CHAOS.md` — catalog of every chaos endpoint with `curl` examples and expected behavior

---

## Dependency Summary

Install these before starting:

```bash
# Runtime
npm install express pino prom-client uuid zod

# Dev
npm install --save-dev @types/express @types/pino @types/uuid vitest supertest @types/supertest
```

---

## File Structure (Final)

```
nodek8s-observer/
├── src/
│   ├── server.ts
│   ├── app.ts
│   ├── config.ts
│   ├── metrics/
│   │   ├── registry.ts
│   │   └── httpMetrics.ts
│   ├── middleware/
│   │   ├── requestId.ts
│   │   ├── logging.ts
│   │   └── errorHandler.ts
│   ├── routes/
│   │   ├── users.ts
│   │   ├── observability.ts
│   │   └── admin.ts
│   ├── store/
│   │   └── userStore.ts
│   ├── chaos/
│   │   └── state.ts
│   └── types/
│       └── user.ts
├── tests/
│   ├── users.test.ts
│   ├── metrics.test.ts
│   └── chaos.test.ts
├── k8s/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── hpa.yaml
│   ├── servicemonitor.yaml
│   └── ingress.yaml
├── monitoring/
│   ├── prometheus-rules.yaml
│   ├── grafana-dashboard.json
│   └── README.md
├── loadtest/
│   ├── script.js
│   └── README.md
├── Dockerfile
├── .dockerignore
├── .gitignore
├── README.md
├── METRICS.md
├── RUNBOOK.md
└── CHAOS.md
```

---

## Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Logger | `pino` | Fastest JSON logger for Node, native structured output |
| Validation | `zod` | Type-safe schema inference, works great with TypeScript |
| Metrics | `prom-client` | Official Prometheus client, ships default Node.js metrics |
| Test runner | `vitest` | Faster than Jest, native TypeScript, compatible with supertest |
| Dev runner | `tsx` | Zero-config TypeScript execution, faster than ts-node |
| In-memory store | `Map<string, User>` | Intentionally simple — data loss on restart is a feature |
| Route normalization | `req.route?.path` | Prevents label cardinality explosion in Prometheus |
