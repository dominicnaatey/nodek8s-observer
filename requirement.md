# Project: Observability Playground API

## 📖 Detailed Description

The **Observability Playground API** is a purpose-built, stateless Node.js/TypeScript application designed to serve as a realistic target for a full observability stack (Prometheus, Grafana, Kubernetes). It is not a "real" product — it is a **controllable signal generator** that produces rich, meaningful telemetry so you can learn, test, and demonstrate monitoring, alerting, and self-healing patterns.

The app does three things simultaneously:

1. **Serves normal-looking HTTP traffic** — a small in-memory user CRUD API that behaves like a typical microservice (200s, 201s, 404s, 204s).
2. **Exposes rich telemetry** — via a `/metrics` endpoint that Prometheus scrapes, containing both default Node.js runtime metrics and custom application metrics following the **RED method** (Rate, Errors, Duration).
3. **Provides a "chaos" control surface** — endpoints that deliberately inject latency, burn CPU, crash the process, or flip health status, allowing you to observe how your monitoring and Kubernetes infrastructure reacts.

It is deployed as a containerized workload on Kubernetes, with Prometheus scraping it and Grafana visualizing the results.

---

## 🎯 Project Goals

By building and running this app, you will be able to:

- **Demonstrate** the RED method (Rate, Errors, Duration) with real PromQL queries.
- **Visualize** request rate, error rate, and latency percentiles (P50/P95/P99) in Grafana.
- **Test** Prometheus alerting rules (e.g., "P95 latency > 1s for 5 minutes").
- **Validate** Kubernetes liveness and readiness probes.
- **Observe** Horizontal Pod Autoscaler (HPA) behavior under CPU load.
- **Practice** chaos engineering by injecting failures in a controlled way.
- **Learn** how application-level metrics flow from code → `/metrics` → Prometheus → Grafana.

---

## 🧱 Functional Requirements

### FR-1: Business Endpoints (In-Memory CRUD)

The app must provide a REST API for a `user` resource, backed by an in-memory data structure (no database).

| ID | Method | Endpoint | Description | Success | Failure |
|----|--------|----------|-------------|---------|---------|
| FR-1.1 | `GET` | `/api/v1/users` | List all users | `200` with array | — |
| FR-1.2 | `GET` | `/api/v1/users/:id` | Get one user by ID | `200` with object | `404` if not found |
| FR-1.3 | `POST` | `/api/v1/users` | Create a user | `201` with created object | `400` if invalid body |
| FR-1.4 | `PUT` | `/api/v1/users/:id` | Update a user | `200` with updated object | `404` if not found |
| FR-1.5 | `DELETE` | `/api/v1/users/:id` | Delete a user | `204` no content | `404` if not found |

**User schema:**
```ts
{
  id: string;        // UUID
  name: string;      // required, non-empty
  email: string;     // required, valid format
  createdAt: string; // ISO 8601 timestamp
}
```

**Constraints:**
- Data is seeded at startup with 3–5 users.
- Data is held in a `Map<string, User>` — lost on restart (this is intentional and acceptable).
- No authentication required (keeps chaos endpoints simple to call).

---

### FR-2: Observability Endpoints

| ID | Method | Endpoint | Description |
|----|--------|----------|-------------|
| FR-2.1 | `GET` | `/metrics` | Prometheus exposition format (text/plain) |
| FR-2.2 | `GET` | `/health` | Liveness probe — returns `200 OK` if process is alive |
| FR-2.3 | `GET` | `/ready` | Readiness probe — returns `200 OK` if ready, `503` if not |
| FR-2.4 | `GET` | `/version` | Returns `{ version, commit, buildTime }` for deployment tracking |

**FR-2.2 details:** `/health` must always return `200` as long as the Node.js event loop is responsive. It must **never** check downstream dependencies.

**FR-2.3 details:** `/ready` must be togglable via a chaos endpoint (see FR-3.4). It must also return `503` during a configurable startup grace period (default 5s).

---

### FR-3: Chaos / Simulation Endpoints

These endpoints are the heart of the app. They must all be prefixed with `/api/v1/admin/` and must be documented as **non-production**.

| ID | Method | Endpoint | Behavior |
|----|--------|----------|----------|
| FR-3.1 | `GET` | `/api/v1/admin/slow?ms=2000` | Sleeps `ms` milliseconds before responding. Max `ms` = 30000. |
| FR-3.2 | `GET` | `/api/v1/admin/cpu-burn?ms=1000&intensity=1` | Runs a busy-loop for `ms` milliseconds. `intensity` (1–10) adds parallel workers. |
| FR-3.3 | `POST` | `/api/v1/admin/crash` | Calls `process.exit(1)` after responding. Used to test K8s restart behavior. |
| FR-3.4 | `POST` | `/api/v1/admin/toggle-ready` | Flips `/ready` between `200` and `503`. Returns the new state. |
| FR-3.5 | `GET` | `/api/v1/admin/error?code=500&rate=1.0` | Returns an HTTP error with the given status code. `rate` (0–1) makes it probabilistic. |
| FR-3.6 | `GET` | `/api/v1/admin/leak?mb=50` | Allocates `mb` MB of memory and holds it, to simulate a memory leak. |
| FR-3.7 | `POST` | `/api/v1/admin/reset` | Clears all accumulated chaos state (restores readiness, frees leaked memory). |

**FR-3.1 details:** Must be interruptible by the client disconnecting (don't hold the process hostage).

**FR-3.2 details:** Must use `setImmediate`-based busy loops, not `sleep`, so it actually consumes CPU.

**FR-3.3 details:** Should respond first (`200 OK`), then exit on the next tick. This gives the client a clean response.

---

### FR-4: Metrics Requirements

The app must expose the following Prometheus metrics:

**Default Node.js metrics** (from `prom-client`'s `collectDefaultMetrics`):
- `process_cpu_seconds_total`
- `process_resident_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- `nodejs_heap_size_used_bytes`
- `nodejs_gc_duration_seconds`
- (+ all others provided by the library)

**Custom HTTP metrics:**

| Metric Name | Type | Labels | Purpose |
|-------------|------|--------|---------|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Request rate + error rate |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Latency percentiles |
| `http_request_size_bytes` | Summary | `method`, `route` | Request payload size |
| `http_response_size_bytes` | Summary | `method`, `route` | Response payload size |
| `http_active_requests` | Gauge | — | In-flight requests |

**Custom business metrics:**

| Metric Name | Type | Labels | Purpose |
|-------------|------|--------|---------|
| `app_users_total` | Gauge | — | Current number of users in memory |
| `app_info` | Gauge | `version`, `node_version` | Build/deployment metadata |
| `app_startup_timestamp_seconds` | Gauge | — | When the process started |

**Histogram bucket config:** Must use buckets suitable for web APIs:
```
[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
```

**Route labeling rule:** Use the *route pattern* (`/api/v1/users/:id`), **not** the raw path. This prevents high-cardinality label explosion. Use `req.route?.path` after routing, or a middleware that normalizes the URL.

---

### FR-5: Middleware Requirements

| ID | Middleware | Purpose |
|----|------------|---------|
| FR-5.1 | Request ID | Generates a UUID per request, adds `X-Request-ID` header |
| FR-5.2 | Metrics | Times every request, records counter + histogram + gauge |
| FR-5.3 | Structured logging | Logs JSON with `level`, `msg`, `method`, `path`, `status`, `durationMs`, `requestId` |
| FR-5.4 | Error handler | Centralized; returns consistent JSON error shape, never leaks stack traces in production |
| FR-5.5 | Body parser | `express.json()` with a 1MB limit |
| FR-5.6 | Graceful shutdown | On `SIGTERM`, stop accepting new requests, finish in-flight ones, then exit |

**FR-5.6 details:** Graceful shutdown is critical for Kubernetes rolling updates. Must set a timeout (e.g., 10s) after which it force-exits.

**Standard error response shape:**
```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with id abc-123 does not exist",
    "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```

---

### FR-6: Health & Lifecycle Requirements

- The app must start listening only after all initialization (metrics registry, route setup) is complete.
- On startup, it must log a structured "server started" message including port, version, and PID.
- On `SIGTERM`/`SIGINT`, it must perform graceful shutdown within 10 seconds.
- It must handle uncaught exceptions and unhandled rejections by logging and exiting (`process.exit(1)`) so Kubernetes can restart the pod.

---

## ⚙️ Non-Functional Requirements

### NFR-1: Technology Stack
- **Language:** TypeScript 5.x (strict mode)
- **Runtime:** Node.js 20 LTS or 22 LTS
- **Framework:** Express 4.x
- **Metrics:** `prom-client` (official Prometheus client)
- **Dev runner:** `tsx` (preferred) or `ts-node`
- **Logger:** `pino` (structured JSON) — or `winston`
- **Validation:** `zod` for request body validation
- **Testing:** `vitest` or `jest` + `supertest`

### NFR-2: Performance
- Must handle **≥ 1000 requests/second** on a single pod for the simple CRUD endpoints.
- The `/metrics` endpoint must respond in **< 50ms** with a registry of < 500 series.
- Metrics middleware must add **< 1ms** overhead per request.

### NFR-3: Portability
- Must run identically on Windows (dev), Linux (container), and Kubernetes.
- Must be fully 12-factor: config via environment variables only.

### NFR-4: Configuration (Env Vars)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `METRICS_ENABLED` | `true` | Toggle `/metrics` endpoint |
| `CHAOS_ENABLED` | `true` | Toggle `/admin/*` endpoints (must be `false` in prod) |
| `STARTUP_GRACE_MS` | `5000` | Delay before `/ready` returns 200 |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown deadline |

### NFR-5: Security
- **No secrets** in the app.
- **Chaos endpoints must be disableable** via `CHAOS_ENABLED=false`.
- **No stack traces** in error responses when `NODE_ENV=production`.
- Runs as **non-root** user inside the container.

### NFR-6: Reliability
- Must not crash on malformed JSON — the error handler catches it (`400`).
- Must not leak memory during normal operation (only the explicit `/leak` endpoint should).
- Must survive 10,000 sequential requests without degradation.

### NFR-7: Observability (Self-Referential)
- All logs must be **JSON-formatted** (parseable by Fluent Bit / Loki).
- Every request must be traceable via `X-Request-ID`.
- All custom metrics must have **help text** describing their purpose.

---

## 📦 Deliverables

### 1. Application Code
```
observability-playground/
├── src/
│   ├── server.ts              # Entry point, listens on PORT
│   ├── app.ts                 # Express app factory (testable)
│   ├── config.ts              # Env var parsing + validation
│   ├── metrics/
│   │   ├── registry.ts        # Prometheus registry setup
│   │   └── httpMetrics.ts     # Middleware + metric definitions
│   ├── middleware/
│   │   ├── requestId.ts
│   │   ├── logging.ts
│   │   └── errorHandler.ts
│   ├── routes/
│   │   ├── users.ts           # FR-1
│   │   ├── observability.ts   # FR-2
│   │   └── admin.ts           # FR-3
│   ├── store/
│   │   └── userStore.ts       # In-memory Map
│   ├── chaos/
│   │   └── state.ts           # Readiness flag, leaked buffers
│   └── types/
│       └── user.ts
├── tests/
│   ├── users.test.ts
│   ├── metrics.test.ts
│   └── chaos.test.ts
├── package.json
├── tsconfig.json
├── Dockerfile
├── .dockerignore
├── .gitignore
└── README.md
```

### 2. Containerization
- **Multi-stage Dockerfile**: builder (with dev deps) → runtime (production only, `node:20-alpine`).
- Image must run as `node` user (UID 1000).
- Image size target: **< 150 MB**.
- Must expose port `3000`.

### 3. Kubernetes Manifests (`/k8s`)
| File | Contents |
|------|----------|
| `namespace.yaml` | Dedicated namespace |
| `deployment.yaml` | 2 replicas, liveness/readiness probes, resource limits |
| `service.yaml` | ClusterIP on port 80 → container 3000 |
| `servicemonitor.yaml` | Prometheus Operator ServiceMonitor for scraping |
| `hpa.yaml` | HorizontalPodAutoscaler (CPU target 70%) |
| `configmap.yaml` | Non-secret env vars |
| `ingress.yaml` | (Optional) External access for demos |

**Probe configuration:**
```yaml
livenessProbe:
  httpGet: { path: /health, port: 3000 }
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet: { path: /ready, port: 3000 }
  initialDelaySeconds: 3
  periodSeconds: 5
  failureThreshold: 2
```

**Resource limits:**
```yaml
resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits:   { cpu: 500m, memory: 256Mi }
```

### 4. Monitoring Configuration (`/monitoring`)
| File | Contents |
|------|----------|
| `prometheus-rules.yaml` | Alerting rules (see below) |
| `grafana-dashboard.json` | Importable dashboard |
| `README.md` | Setup instructions |

**Alerting rules to include:**
| Alert | Condition | Severity |
|-------|-----------|----------|
| `HighErrorRate` | `rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05` | critical |
| `HighLatencyP95` | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1` | warning |
| `PodDown` | `up{job="observability-playground"} == 0` | critical |
| `HighMemoryUsage` | `process_resident_memory_bytes > 200e6` | warning |
| `EventLoopLag` | `nodejs_eventloop_lag_seconds > 0.1` | warning |

**Grafana dashboard panels:**
1. Request rate (RPS) by route — `rate(http_requests_total[1m])`
2. Error rate % — 5xx / total
3. Latency P50/P95/P99 — `histogram_quantile(...)`
4. Active requests (gauge)
5. CPU usage per pod
6. Memory usage per pod
7. Event loop lag
8. Pod up/down status
9. Top 5 slowest routes
10. Chaos endpoint invocation count

### 5. Load Testing Script (`/loadtest`)
- `k6` script or `hey`/`autocannon` wrapper.
- Must generate mixed traffic: 90% normal, 5% slow, 5% errors.
- Produces steady RPS for at least 5 minutes.

### 6. Documentation
- **README.md** — setup, run, and usage instructions.
- **METRICS.md** — table of every metric, its type, labels, and meaning.
- **RUNBOOK.md** — what to do when each alert fires.
- **CHAOS.md** — catalog of every chaos endpoint with examples.

---

## ✅ Acceptance Criteria

The project is complete when all of the following are true:

1. ✅ `npm run dev` starts the server locally on port 3000.
2. ✅ `curl http://localhost:3000/health` returns `200`.
3. ✅ `curl http://localhost:3000/metrics` returns Prometheus-format text including all FR-4 metrics.
4. ✅ Creating/reading/deleting users works and is reflected in `app_users_total`.
5. ✅ Hitting `/admin/slow?ms=3000` visibly shifts the P95 latency panel in Grafana.
6. ✅ Hitting `/admin/cpu-burn?ms=30000` triggers the HPA to scale up (if HPA configured).
7. ✅ Killing the pod via `/admin/crash` results in a Kubernetes restart, with no traffic loss (2+ replicas).
8. ✅ Flipping `/admin/toggle-ready` causes Kubernetes to stop routing traffic to that pod.
9. ✅ All 5 Prometheus alerting rules can be triggered on demand via chaos endpoints.
10. ✅ `docker build` produces an image < 150 MB that runs as non-root.
11. ✅ `kubectl apply -k k8s/` deploys everything successfully.
12. ✅ The Grafana dashboard imports cleanly and shows live data within 30 seconds.

---

## 🚫 Explicit Non-Goals

To keep scope tight, this project will **not** include:

- A frontend/UI (Grafana *is* the UI).
- Authentication or authorization.
- A database (in-memory only).
- Distributed tracing (Jaeger/Tempo) — could be a future extension.
- Log aggregation setup (Loki) — could be a future extension.
- Multi-service architecture — this is a single service by design.

---

## 🗺️ Suggested Build Order

1. **Scaffold** — `package.json`, `tsconfig.json`, Express app skeleton, `/health`.
2. **CRUD** — user store + routes (FR-1).
3. **Metrics** — `prom-client` setup, middleware, `/metrics` (FR-2, FR-4, FR-5).
4. **Chaos** — admin endpoints (FR-3).
5. **Docker** — multi-stage Dockerfile.
6. **Kubernetes** — deployment, service, probes.
7. **Prometheus** — ServiceMonitor + rules.
8. **Grafana** — dashboard JSON.
9. **Load test** — script to keep traffic flowing.
10. **Docs** — README, METRICS.md, RUNBOOK.md, CHAOS.md.

Each step is independently demoable — you'll have something to *see* in Grafana by step 3.