import type { v1 } from "@datadog/datadog-api-client";

// Types
interface QueryOptions {
  query: string;
  from?: string;
  to?: string;
}

interface MetricsResult {
  series: Array<{
    metric: string;
    scope: string;
    pointlist: Array<{
      timestamp: number;
      value: number | null;
    }>;
    tags?: string[];
  }>;
  meta: {
    query: string;
    timeRange: { from: number; to: number };
  };
}

// Main exports
export async function queryMetrics(
  metricsApi: v1.MetricsApi,
  options: QueryOptions
): Promise<MetricsResult> {
  const { from, to } = parseTimeRange(options.from, options.to);

  const response = await metricsApi.queryMetrics({
    from,
    to,
    query: options.query,
  });

  const series: MetricsResult["series"] = [];

  if (response.series) {
    for (const s of response.series) {
      series.push({
        metric: s.metric ?? "",
        scope: s.scope ?? "",
        pointlist: (s.pointlist ?? []).map((point) => ({
          timestamp: point[0] ?? 0,
          value: point[1] ?? null,
        })),
        tags: s.tagSet,
      });
    }
  }

  return {
    series,
    meta: {
      query: options.query,
      timeRange: { from, to },
    },
  };
}

// Helpers
function parseTimeRange(
  from?: string,
  to?: string
): { from: number; to: number } {
  const now = Math.floor(Date.now() / 1000);
  const toTs = to ? parseRelativeTimeToUnix(to, now) : now;
  const fromTs = from ? parseRelativeTimeToUnix(from, now) : now - 15 * 60;

  return { from: fromTs, to: toTs };
}

function parseRelativeTimeToUnix(timeStr: string, nowUnix: number): number {
  const match = timeStr.match(/^(\d+)([mhd])$/);
  if (!match) {
    const parsed = Date.parse(timeStr);
    if (!isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
    return nowUnix;
  }

  const [, value, unit] = match;
  const num = parseInt(value!, 10);

  switch (unit) {
    case "m":
      return nowUnix - num * 60;
    case "h":
      return nowUnix - num * 60 * 60;
    case "d":
      return nowUnix - num * 24 * 60 * 60;
    default:
      return nowUnix;
  }
}
