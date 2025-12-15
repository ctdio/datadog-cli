import type { v2 } from "@datadog/datadog-api-client";

// Types
interface SearchOptions {
  query: string;
  from?: string;
  to?: string;
  limit?: number;
  sort?: "timestamp" | "-timestamp";
}

interface AggregateOptions {
  query: string;
  facet: string;
  from?: string;
  to?: string;
}

interface TailOptions {
  query: string;
  onLog: (log: NormalizedLog) => void;
  onError?: (error: Error) => void;
  pollInterval?: number;
}

interface ContextOptions {
  timestamp: string;
  service?: string;
  before?: string;
  after?: string;
}

interface ErrorSummaryOptions {
  from?: string;
  to?: string;
  service?: string;
}

interface CompareOptions {
  query: string;
  period: string;
}

interface PatternOptions {
  query: string;
  from?: string;
  to?: string;
  limit?: number;
}

interface NormalizedLog {
  id: string;
  timestamp: string;
  service?: string;
  status?: string;
  message?: string;
  traceId?: string;
  host?: string;
  attributes: Record<string, unknown>;
}

interface SearchResult {
  logs: NormalizedLog[];
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

interface ErrorSummaryResult {
  total: number;
  byService: Array<{ service: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  topMessages: Array<{ message: string; count: number }>;
  meta: {
    timeRange: { from: string; to: string };
  };
}

interface CompareResult {
  current: { count: number; timeRange: { from: string; to: string } };
  previous: { count: number; timeRange: { from: string; to: string } };
  change: { absolute: number; percentage: number };
}

interface ServiceListResult {
  services: string[];
  meta: { timeRange: { from: string; to: string } };
}

interface PatternResult {
  patterns: Array<{
    pattern: string;
    count: number;
    sample: string;
  }>;
  meta: {
    timeRange: { from: string; to: string };
    totalLogs: number;
  };
}

// Main exports
export async function searchLogs(
  logsApi: v2.LogsApi,
  options: SearchOptions
): Promise<SearchResult> {
  const { from, to } = parseTimeRange(options.from, options.to);
  const logs: SearchResult["logs"] = [];
  let cursor: string | undefined;
  let total = 0;

  const limit = Math.min(options.limit ?? 100, 1000);

  const response = await logsApi.listLogs({
    body: {
      filter: {
        query: options.query,
        from,
        to,
      },
      sort: options.sort === "timestamp" ? "timestamp" : "-timestamp",
      page: {
        limit,
      },
    },
  });

  if (response.data) {
    for (const log of response.data) {
      logs.push(normalizeLog(log));
    }
  }

  if (response.meta?.page) {
    cursor = response.meta.page.after;
  }

  total = logs.length;

  return {
    logs,
    meta: {
      total,
      cursor,
      timeRange: { from, to },
    },
  };
}

export async function aggregateLogs(
  logsApi: v2.LogsApi,
  options: AggregateOptions
): Promise<AggregateResult> {
  const { from, to } = parseTimeRange(options.from, options.to);

  const response = await logsApi.aggregateLogs({
    body: {
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
  });

  const buckets: AggregateResult["buckets"] = [];

  if (response.data?.buckets) {
    for (const bucket of response.data.buckets) {
      const key = bucket.by?.[options.facet];
      const count = bucket.computes?.["c0"] as number | undefined;
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

export function tailLogs(
  logsApi: v2.LogsApi,
  options: TailOptions
): { stop: () => void } {
  const pollInterval = options.pollInterval ?? 2000;
  const seenIds = new Set<string>();
  let lastTimestamp = new Date().toISOString();
  let running = true;

  async function poll(): Promise<void> {
    if (!running) return;

    try {
      const response = await logsApi.listLogs({
        body: {
          filter: {
            query: options.query,
            from: lastTimestamp,
            to: new Date().toISOString(),
          },
          sort: "timestamp",
          page: { limit: 100 },
        },
      });

      if (response.data) {
        for (const log of response.data) {
          const normalized = normalizeLog(log);
          if (!seenIds.has(normalized.id)) {
            seenIds.add(normalized.id);
            options.onLog(normalized);
            if (normalized.timestamp > lastTimestamp) {
              lastTimestamp = normalized.timestamp;
            }
          }
        }
      }

      // Keep seenIds bounded
      if (seenIds.size > 10000) {
        const idsArray = Array.from(seenIds);
        seenIds.clear();
        for (const id of idsArray.slice(-5000)) {
          seenIds.add(id);
        }
      }
    } catch (err) {
      if (options.onError && err instanceof Error) {
        options.onError(err);
      }
    }

    if (running) {
      setTimeout(poll, pollInterval);
    }
  }

  poll();

  return {
    stop: () => {
      running = false;
    },
  };
}

export async function getLogsByTraceId(
  logsApi: v2.LogsApi,
  traceId: string,
  options: { from?: string; to?: string } = {}
): Promise<SearchResult> {
  const { from, to } = parseTimeRange(options.from ?? "24h", options.to);

  const response = await logsApi.listLogs({
    body: {
      filter: {
        query: `@trace_id:${traceId} OR @dd.trace_id:${traceId}`,
        from,
        to,
      },
      sort: "timestamp",
      page: { limit: 1000 },
    },
  });

  const logs: NormalizedLog[] = [];
  if (response.data) {
    for (const log of response.data) {
      logs.push(normalizeLog(log));
    }
  }

  return {
    logs,
    meta: {
      total: logs.length,
      timeRange: { from, to },
    },
  };
}

export async function getLogContext(
  logsApi: v2.LogsApi,
  options: ContextOptions
): Promise<{ before: NormalizedLog[]; after: NormalizedLog[] }> {
  const targetTimestamp = new Date(options.timestamp);
  const beforeMs = parseDurationToMs(options.before ?? "5m");
  const afterMs = parseDurationToMs(options.after ?? "5m");

  const beforeFrom = new Date(targetTimestamp.getTime() - beforeMs).toISOString();
  const beforeTo = targetTimestamp.toISOString();
  const afterFrom = targetTimestamp.toISOString();
  const afterTo = new Date(targetTimestamp.getTime() + afterMs).toISOString();

  const query = options.service ? `service:${options.service}` : "*";

  const [beforeResponse, afterResponse] = await Promise.all([
    logsApi.listLogs({
      body: {
        filter: { query, from: beforeFrom, to: beforeTo },
        sort: "-timestamp",
        page: { limit: 50 },
      },
    }),
    logsApi.listLogs({
      body: {
        filter: { query, from: afterFrom, to: afterTo },
        sort: "timestamp",
        page: { limit: 50 },
      },
    }),
  ]);

  const before: NormalizedLog[] = [];
  const after: NormalizedLog[] = [];

  if (beforeResponse.data) {
    for (const log of beforeResponse.data) {
      before.unshift(normalizeLog(log));
    }
  }

  if (afterResponse.data) {
    for (const log of afterResponse.data) {
      after.push(normalizeLog(log));
    }
  }

  return { before, after };
}

export async function getErrorSummary(
  logsApi: v2.LogsApi,
  options: ErrorSummaryOptions
): Promise<ErrorSummaryResult> {
  const { from, to } = parseTimeRange(options.from, options.to);
  const baseQuery = options.service
    ? `status:error service:${options.service}`
    : "status:error";

  const [byServiceRes, byStatusRes, totalRes] = await Promise.all([
    logsApi.aggregateLogs({
      body: {
        filter: { query: baseQuery, from, to },
        compute: [{ type: "total", aggregation: "count" }],
        groupBy: [{ facet: "service", limit: 20, sort: { type: "measure", aggregation: "count", order: "desc" } }],
      },
    }),
    logsApi.aggregateLogs({
      body: {
        filter: { query: baseQuery, from, to },
        compute: [{ type: "total", aggregation: "count" }],
        groupBy: [{ facet: "@error.kind", limit: 20, sort: { type: "measure", aggregation: "count", order: "desc" } }],
      },
    }),
    logsApi.aggregateLogs({
      body: {
        filter: { query: baseQuery, from, to },
        compute: [{ type: "total", aggregation: "count" }],
      },
    }),
  ]);

  const byService: ErrorSummaryResult["byService"] = [];
  const byStatus: ErrorSummaryResult["byStatus"] = [];

  if (byServiceRes.data?.buckets) {
    for (const bucket of byServiceRes.data.buckets) {
      const service = bucket.by?.["service"];
      const count = bucket.computes?.["c0"] as number | undefined;
      if (service !== undefined) {
        byService.push({ service: String(service), count: count ?? 0 });
      }
    }
  }

  if (byStatusRes.data?.buckets) {
    for (const bucket of byStatusRes.data.buckets) {
      const status = bucket.by?.["@error.kind"];
      const count = bucket.computes?.["c0"] as number | undefined;
      if (status !== undefined) {
        byStatus.push({ status: String(status), count: count ?? 0 });
      }
    }
  }

  // Get top error messages by searching logs
  const messagesRes = await logsApi.listLogs({
    body: {
      filter: { query: baseQuery, from, to },
      sort: "-timestamp",
      page: { limit: 500 },
    },
  });

  const messageCounts = new Map<string, number>();
  if (messagesRes.data) {
    for (const log of messagesRes.data) {
      const msg = truncateMessage(log.attributes?.message ?? "");
      messageCounts.set(msg, (messageCounts.get(msg) ?? 0) + 1);
    }
  }

  const topMessages = Array.from(messageCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([message, count]) => ({ message, count }));

  let total = 0;
  if (totalRes.data?.buckets?.[0]?.computes?.["c0"]) {
    total = totalRes.data.buckets[0].computes["c0"] as number;
  }

  return {
    total,
    byService,
    byStatus,
    topMessages,
    meta: { timeRange: { from, to } },
  };
}

export async function comparePeriods(
  logsApi: v2.LogsApi,
  options: CompareOptions
): Promise<CompareResult> {
  const periodMs = parseDurationToMs(options.period);
  const now = new Date();

  const currentTo = now.toISOString();
  const currentFrom = new Date(now.getTime() - periodMs).toISOString();
  const previousTo = currentFrom;
  const previousFrom = new Date(now.getTime() - periodMs * 2).toISOString();

  const [currentRes, previousRes] = await Promise.all([
    logsApi.aggregateLogs({
      body: {
        filter: { query: options.query, from: currentFrom, to: currentTo },
        compute: [{ type: "total", aggregation: "count" }],
      },
    }),
    logsApi.aggregateLogs({
      body: {
        filter: { query: options.query, from: previousFrom, to: previousTo },
        compute: [{ type: "total", aggregation: "count" }],
      },
    }),
  ]);

  const currentCount = (currentRes.data?.buckets?.[0]?.computes?.["c0"] as number) ?? 0;
  const previousCount = (previousRes.data?.buckets?.[0]?.computes?.["c0"] as number) ?? 0;

  const absolute = currentCount - previousCount;
  const percentage = previousCount > 0 ? ((absolute / previousCount) * 100) : (currentCount > 0 ? 100 : 0);

  return {
    current: { count: currentCount, timeRange: { from: currentFrom, to: currentTo } },
    previous: { count: previousCount, timeRange: { from: previousFrom, to: previousTo } },
    change: { absolute, percentage: Math.round(percentage * 10) / 10 },
  };
}

export async function listServices(
  logsApi: v2.LogsApi,
  options: { from?: string; to?: string } = {}
): Promise<ServiceListResult> {
  const { from, to } = parseTimeRange(options.from ?? "24h", options.to);

  const response = await logsApi.aggregateLogs({
    body: {
      filter: { query: "*", from, to },
      compute: [{ type: "total", aggregation: "count" }],
      groupBy: [{ facet: "service", limit: 500, sort: { type: "measure", aggregation: "count", order: "desc" } }],
    },
  });

  const services: string[] = [];
  if (response.data?.buckets) {
    for (const bucket of response.data.buckets) {
      const service = bucket.by?.["service"];
      if (service !== undefined) {
        services.push(String(service));
      }
    }
  }

  return { services, meta: { timeRange: { from, to } } };
}

export async function getLogPatterns(
  logsApi: v2.LogsApi,
  options: PatternOptions
): Promise<PatternResult> {
  const { from, to } = parseTimeRange(options.from, options.to);
  const limit = options.limit ?? 500;

  const response = await logsApi.listLogs({
    body: {
      filter: { query: options.query, from, to },
      sort: "-timestamp",
      page: { limit },
    },
  });

  const patternMap = new Map<string, { count: number; sample: string }>();

  if (response.data) {
    for (const log of response.data) {
      const message = log.attributes?.message ?? "";
      const pattern = extractPattern(message);
      const existing = patternMap.get(pattern);
      if (existing) {
        existing.count++;
      } else {
        patternMap.set(pattern, { count: 1, sample: message });
      }
    }
  }

  const patterns = Array.from(patternMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      sample: data.sample,
    }));

  return {
    patterns,
    meta: { timeRange: { from, to }, totalLogs: response.data?.length ?? 0 },
  };
}

export async function multiQuery(
  logsApi: v2.LogsApi,
  queries: Array<{ name: string; query: string; from?: string; to?: string }>
): Promise<Record<string, SearchResult>> {
  const results = await Promise.all(
    queries.map(async (q) => {
      const result = await searchLogs(logsApi, {
        query: q.query,
        from: q.from,
        to: q.to,
        limit: 100,
      });
      return { name: q.name, result };
    })
  );

  const output: Record<string, SearchResult> = {};
  for (const { name, result } of results) {
    output[name] = result;
  }
  return output;
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

function normalizeLog(log: v2.Log): NormalizedLog {
  const attributes = log.attributes?.attributes ?? {};
  const tags = log.attributes?.tags ?? [];

  // Extract trace ID from various locations
  const traceId = (attributes["dd.trace_id"] as string | undefined) ??
    (attributes["trace_id"] as string | undefined) ??
    tags.find(t => t.startsWith("trace_id:"))?.split(":")[1];

  // Extract host from tags or attributes
  const host = (attributes["host"] as string | undefined) ??
    tags.find(t => t.startsWith("host:"))?.split(":")[1];

  return {
    id: log.id ?? "",
    timestamp: log.attributes?.timestamp?.toISOString() ?? "",
    service: log.attributes?.service,
    status: log.attributes?.status,
    message: log.attributes?.message,
    traceId,
    host,
    attributes,
  };
}

function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 5 * 60 * 1000; // Default 5 minutes

  const [, value, unit] = match;
  const num = parseInt(value!, 10);

  switch (unit) {
    case "s":
      return num * 1000;
    case "m":
      return num * 60 * 1000;
    case "h":
      return num * 60 * 60 * 1000;
    case "d":
      return num * 24 * 60 * 60 * 1000;
    default:
      return 5 * 60 * 1000;
  }
}

function truncateMessage(message: string, maxLength = 100): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength) + "...";
}

function extractPattern(message: string): string {
  return message
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>")
    // Replace hex strings (32+ chars)
    .replace(/\b[0-9a-f]{32,}\b/gi, "<HEX>")
    // Replace numbers
    .replace(/\b\d+\b/g, "<N>")
    // Replace IP addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<IP>")
    // Replace email-like patterns
    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, "<EMAIL>")
    // Replace URLs
    .replace(/https?:\/\/[^\s]+/g, "<URL>")
    // Replace quoted strings
    .replace(/"[^"]*"/g, '"<STR>"')
    .replace(/'[^']*'/g, "'<STR>'")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}
