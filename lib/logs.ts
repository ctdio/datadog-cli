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

interface SearchResult {
  logs: Array<{
    id: string;
    timestamp: string;
    service?: string;
    status?: string;
    message?: string;
    attributes: Record<string, unknown>;
  }>;
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

export async function getLogById(
  logsApi: v2.LogsApi,
  id: string
): Promise<SearchResult["logs"][0] | null> {
  const response = await logsApi.listLogs({
    body: {
      filter: {
        query: `@id:${id}`,
      },
      page: { limit: 1 },
    },
  });

  if (response.data && response.data.length > 0 && response.data[0]) {
    return normalizeLog(response.data[0]);
  }

  return null;
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

function normalizeLog(log: v2.Log): SearchResult["logs"][0] {
  const attributes = log.attributes?.attributes ?? {};
  return {
    id: log.id ?? "",
    timestamp: log.attributes?.timestamp?.toISOString() ?? "",
    service: log.attributes?.service,
    status: log.attributes?.status,
    message: log.attributes?.message,
    attributes,
  };
}
