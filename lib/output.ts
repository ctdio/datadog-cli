// Types
interface OutputOptions {
  pretty?: boolean;
  output?: string;
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

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
};

// Main exports
export function formatOutput(data: unknown, options: OutputOptions = {}): string {
  if (options.pretty) {
    return formatPretty(data);
  }
  return JSON.stringify(data);
}

export function printOutput(data: unknown, options: OutputOptions = {}): void {
  const output = formatOutput(data, options);
  console.log(output);
}

export function printError(error: unknown, options: OutputOptions = {}): void {
  const errorData = normalizeError(error);
  if (options.pretty) {
    console.error(`${colors.red}${colors.bold}Error:${colors.reset} ${errorData.error}`);
    if (errorData.details) {
      console.error(`${colors.dim}${JSON.stringify(errorData.details, null, 2)}${colors.reset}`);
    }
  } else {
    console.error(formatOutput(errorData, options));
  }
  process.exit(1);
}

export function printLog(log: NormalizedLog, options: OutputOptions = {}): void {
  if (options.pretty) {
    console.log(formatLogPretty(log));
  } else {
    console.log(JSON.stringify(log));
  }
}

export function printStreamingLog(log: NormalizedLog): void {
  console.log(formatLogPretty(log));
}

export async function writeToFile(data: unknown, filePath: string): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await Bun.write(filePath, content);
  console.log(`${colors.green}Written to ${filePath}${colors.reset}`);
}

// Helpers
function formatPretty(data: unknown): string {
  if (isLogSearchResult(data)) {
    return formatLogSearchResult(data as { logs: NormalizedLog[]; meta: { total: number; timeRange: { from: string; to: string } } });
  }
  if (isAggregateResult(data)) {
    return formatAggregateResult(data as { buckets: Array<{ key: string; count: number }>; meta: { timeRange: { from: string; to: string } } });
  }
  if (isErrorSummary(data)) {
    return formatErrorSummary(data as { total: number; byService: Array<{ service: string; count: number }>; byStatus: Array<{ status: string; count: number }>; topMessages: Array<{ message: string; count: number }>; meta: { timeRange: { from: string; to: string } } });
  }
  if (isCompareResult(data)) {
    return formatCompareResult(data as { current: { count: number; timeRange: { from: string; to: string } }; previous: { count: number; timeRange: { from: string; to: string } }; change: { absolute: number; percentage: number } });
  }
  if (isServiceList(data)) {
    return formatServiceList(data as { services: string[]; meta: { timeRange: { from: string; to: string } } });
  }
  if (isPatternResult(data)) {
    return formatPatternResult(data as { patterns: Array<{ pattern: string; count: number; sample: string }>; meta: { timeRange: { from: string; to: string }; totalLogs: number } });
  }
  if (isContextResult(data)) {
    return formatContextResult(data as { before: NormalizedLog[]; after: NormalizedLog[] });
  }
  if (isMetricsResult(data)) {
    return formatMetricsResult(data as { series: Array<{ metric: string; scope: string; pointlist: Array<{ timestamp: number; value: number | null }>; tags?: string[] }>; meta: { query: string; timeRange: { from: number; to: number } } });
  }
  if (isSingleLog(data)) {
    return formatLogPretty(data as NormalizedLog);
  }
  return JSON.stringify(data, null, 2);
}

function formatLogPretty(log: NormalizedLog): string {
  const ts = formatTimestamp(log.timestamp);
  const status = formatStatus(log.status);
  const service = log.service ? `${colors.cyan}[${log.service}]${colors.reset}` : "";
  const host = log.host ? `${colors.dim}@${log.host}${colors.reset}` : "";
  const message = log.message ?? "";
  const traceId = log.traceId ? `${colors.dim}trace:${log.traceId.slice(0, 8)}${colors.reset}` : "";

  const parts = [ts, status, service, host, traceId].filter(Boolean);
  return `${parts.join(" ")} ${message}`;
}

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  const date = new Date(ts);
  const time = date.toLocaleTimeString("en-US", { hour12: false });
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${colors.gray}${time}.${ms}${colors.reset}`;
}

function formatStatus(status?: string): string {
  if (!status) return "";
  switch (status.toLowerCase()) {
    case "error":
      return `${colors.bgRed}${colors.white} ERR ${colors.reset}`;
    case "warn":
    case "warning":
      return `${colors.bgYellow}${colors.white} WRN ${colors.reset}`;
    case "info":
      return `${colors.bgBlue}${colors.white} INF ${colors.reset}`;
    case "debug":
      return `${colors.bgGreen}${colors.white} DBG ${colors.reset}`;
    default:
      return `${colors.dim}[${status}]${colors.reset}`;
  }
}

function formatLogSearchResult(data: { logs: NormalizedLog[]; meta: { total: number; timeRange: { from: string; to: string } } }): string {
  const lines: string[] = [];
  lines.push(`${colors.bold}Logs (${data.meta.total})${colors.reset} ${colors.dim}${formatTimeRange(data.meta.timeRange)}${colors.reset}`);
  lines.push("");

  for (const log of data.logs) {
    lines.push(formatLogPretty(log));
  }

  return lines.join("\n");
}

function formatAggregateResult(data: { buckets: Array<{ key: string; count: number }>; meta: { timeRange: { from: string; to: string } } }): string {
  const lines: string[] = [];
  lines.push(`${colors.bold}Aggregation${colors.reset} ${colors.dim}${formatTimeRange(data.meta.timeRange)}${colors.reset}`);
  lines.push("");

  const maxCount = Math.max(...data.buckets.map(b => b.count), 1);
  const maxKeyLen = Math.max(...data.buckets.map(b => b.key.length), 10);

  for (const bucket of data.buckets) {
    const bar = "█".repeat(Math.ceil((bucket.count / maxCount) * 20));
    const countStr = bucket.count.toString().padStart(8);
    lines.push(`${bucket.key.padEnd(maxKeyLen)} ${colors.cyan}${bar}${colors.reset} ${countStr}`);
  }

  return lines.join("\n");
}

function formatErrorSummary(data: { total: number; byService: Array<{ service: string; count: number }>; byStatus: Array<{ status: string; count: number }>; topMessages: Array<{ message: string; count: number }>; meta: { timeRange: { from: string; to: string } } }): string {
  const lines: string[] = [];
  lines.push(`${colors.bold}${colors.red}Error Summary${colors.reset} ${colors.dim}${formatTimeRange(data.meta.timeRange)}${colors.reset}`);
  lines.push(`${colors.bold}Total Errors: ${data.total}${colors.reset}`);
  lines.push("");

  if (data.byService.length > 0) {
    lines.push(`${colors.bold}By Service:${colors.reset}`);
    for (const item of data.byService.slice(0, 10)) {
      lines.push(`  ${colors.cyan}${item.service}${colors.reset}: ${item.count}`);
    }
    lines.push("");
  }

  if (data.byStatus.length > 0) {
    lines.push(`${colors.bold}By Error Type:${colors.reset}`);
    for (const item of data.byStatus.slice(0, 10)) {
      lines.push(`  ${colors.yellow}${item.status}${colors.reset}: ${item.count}`);
    }
    lines.push("");
  }

  if (data.topMessages.length > 0) {
    lines.push(`${colors.bold}Top Messages:${colors.reset}`);
    for (const item of data.topMessages.slice(0, 5)) {
      lines.push(`  ${colors.dim}(${item.count})${colors.reset} ${item.message}`);
    }
  }

  return lines.join("\n");
}

function formatCompareResult(data: { current: { count: number; timeRange: { from: string; to: string } }; previous: { count: number; timeRange: { from: string; to: string } }; change: { absolute: number; percentage: number } }): string {
  const lines: string[] = [];
  lines.push(`${colors.bold}Period Comparison${colors.reset}`);
  lines.push("");

  const changeColor = data.change.absolute > 0 ? colors.red : data.change.absolute < 0 ? colors.green : colors.gray;
  const changeSign = data.change.absolute > 0 ? "+" : "";
  const arrow = data.change.absolute > 0 ? "↑" : data.change.absolute < 0 ? "↓" : "→";

  lines.push(`${colors.bold}Current:${colors.reset}  ${data.current.count.toLocaleString()} ${colors.dim}${formatTimeRange(data.current.timeRange)}${colors.reset}`);
  lines.push(`${colors.bold}Previous:${colors.reset} ${data.previous.count.toLocaleString()} ${colors.dim}${formatTimeRange(data.previous.timeRange)}${colors.reset}`);
  lines.push("");
  lines.push(`${colors.bold}Change:${colors.reset}   ${changeColor}${arrow} ${changeSign}${data.change.absolute.toLocaleString()} (${changeSign}${data.change.percentage}%)${colors.reset}`);

  return lines.join("\n");
}

function formatServiceList(data: { services: string[]; meta: { timeRange: { from: string; to: string } } }): string {
  const lines: string[] = [];
  lines.push(`${colors.bold}Services (${data.services.length})${colors.reset} ${colors.dim}${formatTimeRange(data.meta.timeRange)}${colors.reset}`);
  lines.push("");

  for (const service of data.services) {
    lines.push(`  ${colors.cyan}${service}${colors.reset}`);
  }

  return lines.join("\n");
}

function formatPatternResult(data: { patterns: Array<{ pattern: string; count: number; sample: string }>; meta: { timeRange: { from: string; to: string }; totalLogs: number } }): string {
  const lines: string[] = [];
  lines.push(`${colors.bold}Log Patterns${colors.reset} ${colors.dim}(${data.meta.totalLogs} logs analyzed)${colors.reset}`);
  lines.push("");

  for (let i = 0; i < data.patterns.length; i++) {
    const p = data.patterns[i]!;
    lines.push(`${colors.bold}${i + 1}. ${colors.cyan}${p.count}x${colors.reset} ${p.pattern}`);
    lines.push(`   ${colors.dim}Sample: ${p.sample.slice(0, 100)}${p.sample.length > 100 ? "..." : ""}${colors.reset}`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatContextResult(data: { before: NormalizedLog[]; after: NormalizedLog[] }): string {
  const lines: string[] = [];
  lines.push(`${colors.bold}Log Context${colors.reset}`);
  lines.push("");

  if (data.before.length > 0) {
    lines.push(`${colors.dim}--- Before (${data.before.length} logs) ---${colors.reset}`);
    for (const log of data.before) {
      lines.push(formatLogPretty(log));
    }
    lines.push("");
  }

  lines.push(`${colors.bgYellow}${colors.bold} TARGET TIMESTAMP ${colors.reset}`);
  lines.push("");

  if (data.after.length > 0) {
    lines.push(`${colors.dim}--- After (${data.after.length} logs) ---${colors.reset}`);
    for (const log of data.after) {
      lines.push(formatLogPretty(log));
    }
  }

  return lines.join("\n");
}

function formatMetricsResult(data: { series: Array<{ metric: string; scope: string; pointlist: Array<{ timestamp: number; value: number | null }>; tags?: string[] }>; meta: { query: string; timeRange: { from: number; to: number } } }): string {
  const lines: string[] = [];
  lines.push(`${colors.bold}Metrics Query:${colors.reset} ${data.meta.query}`);
  lines.push("");

  for (const s of data.series) {
    lines.push(`${colors.cyan}${s.metric}${colors.reset} ${colors.dim}${s.scope}${colors.reset}`);
    if (s.tags && s.tags.length > 0) {
      lines.push(`  ${colors.dim}Tags: ${s.tags.join(", ")}${colors.reset}`);
    }

    const values = s.pointlist.filter(p => p.value !== null);
    if (values.length > 0) {
      const latest = values[values.length - 1]!;
      const min = Math.min(...values.map(p => p.value!));
      const max = Math.max(...values.map(p => p.value!));
      const avg = values.reduce((sum, p) => sum + p.value!, 0) / values.length;

      lines.push(`  Latest: ${colors.bold}${formatNumber(latest.value!)}${colors.reset}`);
      lines.push(`  ${colors.dim}Min: ${formatNumber(min)} | Max: ${formatNumber(max)} | Avg: ${formatNumber(avg)}${colors.reset}`);
      lines.push(`  ${colors.dim}Points: ${values.length}${colors.reset}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatTimeRange(range: { from: string; to: string }): string {
  const from = new Date(range.from);
  const to = new Date(range.to);
  return `${from.toLocaleString()} - ${to.toLocaleString()}`;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(2) + "K";
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

function normalizeError(error: unknown): { error: string; details?: unknown } {
  if (error instanceof Error) {
    return {
      error: error.message,
      details: "cause" in error ? error.cause : undefined,
    };
  }
  if (typeof error === "object" && error !== null) {
    return { error: "API Error", details: error };
  }
  return { error: String(error) };
}

// Type guards - use 'any' internally for type narrowing, then cast in formatters
function isLogSearchResult(data: unknown): boolean {
  return typeof data === "object" && data !== null && "logs" in data && "meta" in data && Array.isArray((data as { logs: unknown }).logs);
}

function isAggregateResult(data: unknown): boolean {
  return typeof data === "object" && data !== null && "buckets" in data && Array.isArray((data as { buckets: unknown }).buckets);
}

function isErrorSummary(data: unknown): boolean {
  return typeof data === "object" && data !== null && "byService" in data && "topMessages" in data;
}

function isCompareResult(data: unknown): boolean {
  return typeof data === "object" && data !== null && "current" in data && "previous" in data && "change" in data;
}

function isServiceList(data: unknown): boolean {
  return typeof data === "object" && data !== null && "services" in data && Array.isArray((data as { services: unknown }).services);
}

function isPatternResult(data: unknown): boolean {
  return typeof data === "object" && data !== null && "patterns" in data && Array.isArray((data as { patterns: unknown }).patterns);
}

function isContextResult(data: unknown): boolean {
  return typeof data === "object" && data !== null && "before" in data && "after" in data;
}

function isMetricsResult(data: unknown): boolean {
  return typeof data === "object" && data !== null && "series" in data && "meta" in data && typeof (data as { meta: { query?: string } }).meta?.query === "string";
}

function isSingleLog(data: unknown): boolean {
  return typeof data === "object" && data !== null && "id" in data && "timestamp" in data && "attributes" in data && !("logs" in data);
}
