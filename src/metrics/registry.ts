import { Registry, collectDefaultMetrics } from '@prometheus-io/client';

// Single registry instance shared across the app
export const registry = new Registry();

// Collect default Node.js runtime metrics:
// process_cpu_seconds_total, process_resident_memory_bytes,
// nodejs_eventloop_lag_seconds, nodejs_heap_size_used_bytes,
// nodejs_gc_duration_seconds, and more
collectDefaultMetrics({ register: registry });
