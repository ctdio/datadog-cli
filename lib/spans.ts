import type { v2 } from "@datadog/datadog-api-client";

// Types
interface SearchOptions {
  query: string;
  from?: string;
  to?: string;
  limit?: number;
  sort?: "timestamp" | "-timestamp";
  minDuration?: string;
}

interface ErrorSummaryOptions {
  from?: string;
  to?: string;
  service?: string;
}

interface ErrorSummaryResult {
  total: number;
  byService: Array<{ service: string; count: number }>;
  byResource: Array<{ resource: string; count: number }>;
  recentErrors: NormalizedSpan[];
  meta: { timeRange: { from: string; to: string } };
}

interface TraceHierarchyResult {
  spans: NormalizedSpan[];
  tree: TraceNode[];
  meta: {
    traceId: string;
    totalSpans: number;
    totalDuration?: number;
    timeRange: { from: string; to: string };
  };
}

interface TraceNode {
  span: NormalizedSpan;
  children: TraceNode[];
  depth: number;
}

interface AggregateOptions {
  query: string;
  facet: string;
  from?: string;
  to?: string;
}

interface NormalizedSpan {
  spanId: string;
  traceId: string;
  parentId?: string;
  timestamp: string;
  service?: string;
  resourceName?: string;
  operationName?: string;
  duration?: number;
  status?: string;
  env?: string;
  host?: string;
  spanType?: string;
  attributes: Record<string, unknown>;
}

interface SearchResult {
  spans: NormalizedSpan[];
  meta: {
    total: number;
    cursor?: string;
    timeRange: { from: string; to: string };
  };
}

interface AggregateResult {
  buckets: Array<{
    key: string;
    count: number;
  }>;
  meta: {
    timeRange: { from: string; to: string };
  };
}

// Main exports
export async function searchSpans(
  spansApi: v2.SpansApi,
  options: SearchOptions
): Promise<SearchResult> {
  const { from, to } = parseTimeRange(options.from, options.to);
  const limit = Math.min(options.limit ?? 100, 1000);

  // Build query with duration filter if specified
  let query = options.query;
  if (options.minDuration) {
    const durationNs = parseDurationToNs(options.minDuration);
    query = `${query} @duration:>=${durationNs}`;
  }

  const response = await spansApi.listSpansGet({
    filterQuery: query,
    filterFrom: from,
    filterTo: to,
    sort: options.sort === "timestamp" ? "timestamp" : "-timestamp",
    pageLimit: limit,
  });

  const spans: NormalizedSpan[] = [];
  if (response.data) {
    for (const span of response.data) {
      spans.push(normalizeSpan(span));
    }
  }

  let cursor: string | undefined;
  if (response.meta?.page) {
    cursor = response.meta.page.after;
  }

  return {
    spans,
    meta: {
      total: spans.length,
      cursor,
      timeRange: { from, to },
    },
  };
}

export async function aggregateSpans(
  spansApi: v2.SpansApi,
  options: AggregateOptions
): Promise<AggregateResult> {
  const { from, to } = parseTimeRange(options.from, options.to);

  const response = await spansApi.aggregateSpans({
    body: {
      data: {
        attributes: {
          filter: {
            query: options.query,
            from,
            to,
          },
          compute: [
            {
              type: "total",
              aggregation: "count",
            },
          ],
          groupBy: [
            {
              facet: options.facet,
              limit: 100,
              sort: {
                type: "measure",
                aggregation: "count",
                order: "desc",
              },
            },
          ],
        },
        type: "aggregate_request",
      },
    },
  });

  const buckets: AggregateResult["buckets"] = [];

  if (response.data) {
    for (const bucket of response.data) {
      const key = bucket.attributes?.by?.[options.facet];
      const computes = bucket.attributes?.compute;
      const count = computes?.["c0"] as number | undefined;
      if (key !== undefined) {
        buckets.push({
          key: String(key),
          count: count ?? 0,
        });
      }
    }
  }

  return {
    buckets,
    meta: {
      timeRange: { from, to },
    },
  };
}

export async function getSpansByTraceId(
  spansApi: v2.SpansApi,
  traceId: string,
  options: { from?: string; to?: string } = {}
): Promise<SearchResult> {
  const { from, to } = parseTimeRange(options.from ?? "24h", options.to);

  const response = await spansApi.listSpansGet({
    filterQuery: `trace_id:${traceId}`,
    filterFrom: from,
    filterTo: to,
    sort: "timestamp",
    pageLimit: 1000,
  });

  const spans: NormalizedSpan[] = [];
  if (response.data) {
    for (const span of response.data) {
      spans.push(normalizeSpan(span));
    }
  }

  return {
    spans,
    meta: {
      total: spans.length,
      timeRange: { from, to },
    },
  };
}

export async function listSpanServices(
  spansApi: v2.SpansApi,
  options: { from?: string; to?: string } = {}
): Promise<{ services: string[]; meta: { timeRange: { from: string; to: string } } }> {
  const { from, to } = parseTimeRange(options.from ?? "24h", options.to);

  const response = await spansApi.aggregateSpans({
    body: {
      data: {
        attributes: {
          filter: { query: "*", from, to },
          compute: [{ type: "total", aggregation: "count" }],
          groupBy: [{ facet: "service", limit: 500, sort: { type: "measure", aggregation: "count", order: "desc" } }],
        },
        type: "aggregate_request",
      },
    },
  });

  const services: string[] = [];
  if (response.data) {
    for (const bucket of response.data) {
      const service = bucket.attributes?.by?.["service"];
      if (service !== undefined) {
        services.push(String(service));
      }
    }
  }

  return { services, meta: { timeRange: { from, to } } };
}

export async function getSpanErrors(
  spansApi: v2.SpansApi,
  options: ErrorSummaryOptions
): Promise<ErrorSummaryResult> {
  const { from, to } = parseTimeRange(options.from, options.to);
  const baseQuery = options.service
    ? `status:error service:${options.service}`
    : "status:error";

  const [byServiceRes, byResourceRes, recentRes] = await Promise.all([
    spansApi.aggregateSpans({
      body: {
        data: {
          attributes: {
            filter: { query: baseQuery, from, to },
            compute: [{ type: "total", aggregation: "count" }],
            groupBy: [{ facet: "service", limit: 20, sort: { type: "measure", aggregation: "count", order: "desc" } }],
          },
          type: "aggregate_request",
        },
      },
    }),
    spansApi.aggregateSpans({
      body: {
        data: {
          attributes: {
            filter: { query: baseQuery, from, to },
            compute: [{ type: "total", aggregation: "count" }],
            groupBy: [{ facet: "resource_name", limit: 20, sort: { type: "measure", aggregation: "count", order: "desc" } }],
          },
          type: "aggregate_request",
        },
      },
    }),
    spansApi.listSpansGet({
      filterQuery: baseQuery,
      filterFrom: from,
      filterTo: to,
      sort: "-timestamp",
      pageLimit: 20,
    }),
  ]);

  const byService: ErrorSummaryResult["byService"] = [];
  const byResource: ErrorSummaryResult["byResource"] = [];
  const recentErrors: NormalizedSpan[] = [];

  if (byServiceRes.data) {
    for (const bucket of byServiceRes.data) {
      const service = bucket.attributes?.by?.["service"];
      const count = bucket.attributes?.compute?.["c0"] as number | undefined;
      if (service !== undefined) {
        byService.push({ service: String(service), count: count ?? 0 });
      }
    }
  }

  if (byResourceRes.data) {
    for (const bucket of byResourceRes.data) {
      const resource = bucket.attributes?.by?.["resource_name"];
      const count = bucket.attributes?.compute?.["c0"] as number | undefined;
      if (resource !== undefined) {
        byResource.push({ resource: String(resource), count: count ?? 0 });
      }
    }
  }

  if (recentRes.data) {
    for (const span of recentRes.data) {
      recentErrors.push(normalizeSpan(span));
    }
  }

  const total = byService.reduce((sum, s) => sum + s.count, 0);

  return {
    total,
    byService,
    byResource,
    recentErrors,
    meta: { timeRange: { from, to } },
  };
}

export async function getTraceHierarchy(
  spansApi: v2.SpansApi,
  traceId: string,
  options: { from?: string; to?: string } = {}
): Promise<TraceHierarchyResult> {
  const { from, to } = parseTimeRange(options.from ?? "24h", options.to);

  const response = await spansApi.listSpansGet({
    filterQuery: `trace_id:${traceId}`,
    filterFrom: from,
    filterTo: to,
    sort: "timestamp",
    pageLimit: 1000,
  });

  const spans: NormalizedSpan[] = [];
  if (response.data) {
    for (const span of response.data) {
      spans.push(normalizeSpan(span));
    }
  }

  // Build the tree structure
  const tree = buildTraceTree(spans);

  // Calculate total duration from root spans
  let totalDuration: number | undefined;
  const rootSpans = spans.filter(s => !s.parentId || !spans.some(p => p.spanId === s.parentId));
  if (rootSpans.length > 0) {
    const durations = rootSpans.map(s => s.duration ?? 0);
    totalDuration = Math.max(...durations);
  }

  return {
    spans,
    tree,
    meta: {
      traceId,
      totalSpans: spans.length,
      totalDuration,
      timeRange: { from, to },
    },
  };
}

// Helpers
function parseTimeRange(
  from?: string,
  to?: string
): { from: string; to: string } {
  const now = new Date();
  const toDate = to ? parseRelativeTime(to, now) : now;
  const fromDate = from ? parseRelativeTime(from, now) : new Date(now.getTime() - 15 * 60 * 1000);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
}

function parseRelativeTime(timeStr: string, now: Date): Date {
  const match = timeStr.match(/^(\d+)([mhd])$/);
  if (!match) {
    const parsed = new Date(timeStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    return now;
  }

  const [, value, unit] = match;
  const num = parseInt(value!, 10);
  const ms = now.getTime();

  switch (unit) {
    case "m":
      return new Date(ms - num * 60 * 1000);
    case "h":
      return new Date(ms - num * 60 * 60 * 1000);
    case "d":
      return new Date(ms - num * 24 * 60 * 60 * 1000);
    default:
      return now;
  }
}

function normalizeSpan(span: v2.Span): NormalizedSpan {
  // Access the raw span data - additionalProperties contains status/error info
  const rawAttrs = span.attributes as Record<string, unknown> | undefined;
  const additionalProps = (rawAttrs?.additionalProperties ?? {}) as Record<string, unknown>;
  const customAttrs = (rawAttrs?.custom ?? {}) as Record<string, unknown>;

  // Duration: calculate from start/end timestamps if available
  const startTs = span.attributes?.startTimestamp;
  const endTs = span.attributes?.endTimestamp;
  let duration: number | undefined;
  if (startTs && endTs) {
    duration = endTs.getTime() - startTs.getTime();
  }

  // Status/error detection - check additionalProperties.status or presence of error object
  const statusFromProps = additionalProps["status"] as string | undefined;
  const errorInProps = additionalProps["error"] as Record<string, unknown> | undefined;
  const errorInCustom = customAttrs["error"] as Record<string, unknown> | undefined;
  const status = statusFromProps === "error" || errorInProps || errorInCustom ? "error" : "ok";

  // Get operation name from additionalProperties or type
  const operationName =
    (additionalProps["operation_name"] as string | undefined) ??
    (customAttrs["operation.name"] as string | undefined) ??
    span.attributes?.type;

  // Merge error details into attributes for visibility
  const mergedAttrs = { ...additionalProps, ...customAttrs };

  return {
    spanId: span.attributes?.spanId ?? span.id ?? "",
    traceId: span.attributes?.traceId ?? "",
    parentId: span.attributes?.parentId,
    timestamp: span.attributes?.startTimestamp?.toISOString() ?? "",
    service: span.attributes?.service,
    resourceName: span.attributes?.resourceName,
    operationName,
    duration,
    status,
    env: span.attributes?.env,
    host: span.attributes?.host,
    spanType: span.attributes?.type,
    attributes: mergedAttrs,
  };
}

function parseDurationToNs(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)(us|µs|ms|s|m)$/);
  if (!match) return 0;

  const [, value, unit] = match;
  const num = parseFloat(value!);

  switch (unit) {
    case "us":
    case "µs":
      return num * 1000; // microseconds to nanoseconds
    case "ms":
      return num * 1_000_000; // milliseconds to nanoseconds
    case "s":
      return num * 1_000_000_000; // seconds to nanoseconds
    case "m":
      return num * 60 * 1_000_000_000; // minutes to nanoseconds
    default:
      return 0;
  }
}

function buildTraceTree(spans: NormalizedSpan[]): TraceNode[] {
  const spanMap = new Map<string, TraceNode>();
  const roots: TraceNode[] = [];

  // Create nodes for all spans
  for (const span of spans) {
    spanMap.set(span.spanId, { span, children: [], depth: 0 });
  }

  // Build parent-child relationships
  for (const span of spans) {
    const node = spanMap.get(span.spanId)!;
    if (span.parentId && spanMap.has(span.parentId)) {
      const parent = spanMap.get(span.parentId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Calculate depths
  function setDepth(node: TraceNode, depth: number): void {
    node.depth = depth;
    for (const child of node.children) {
      setDepth(child, depth + 1);
    }
  }

  for (const root of roots) {
    setDepth(root, 0);
  }

  // Sort children by timestamp
  function sortChildren(node: TraceNode): void {
    node.children.sort((a, b) =>
      new Date(a.span.timestamp).getTime() - new Date(b.span.timestamp).getTime()
    );
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  for (const root of roots) {
    sortChildren(root);
  }

  return roots;
}
