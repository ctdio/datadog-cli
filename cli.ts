#!/usr/bin/env bun

import { createClients } from "./lib/client";
import {
  searchLogs,
  aggregateLogs,
  tailLogs,
  getLogsByTraceId,
  getLogContext,
  getErrorSummary,
  comparePeriods,
  listServices,
  getLogPatterns,
  multiQuery,
} from "./lib/logs";
import { queryMetrics } from "./lib/metrics";
import { printOutput, printError, printStreamingLog, writeToFile } from "./lib/output";

// Types
interface GlobalFlags {
  pretty: boolean;
  site?: string;
  output?: string;
}

// Main CLI entrypoint
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    return;
  }

  const globalFlags = extractGlobalFlags(args);
  const filteredArgs = args.filter(
    (arg) => !arg.startsWith("--pretty") && !arg.startsWith("--site") && !arg.startsWith("--output")
  );

  // Handle --output flag value
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      globalFlags.output = args[i + 1];
    }
  }

  const [command, subcommand, ...rest] = filteredArgs;

  try {
    const clients = createClients(globalFlags.site);

    if (command === "logs") {
      await handleLogsCommand(clients, subcommand ?? "", rest, globalFlags);
    } else if (command === "metrics") {
      await handleMetricsCommand(clients, subcommand ?? "", rest, globalFlags);
    } else if (command === "errors") {
      await handleErrorsCommand(clients, rest, globalFlags);
    } else if (command === "services") {
      await handleServicesCommand(clients, rest, globalFlags);
    } else {
      printError({ error: `Unknown command: ${command}`, help: "Run 'datadog --help' for usage" }, globalFlags);
    }
  } catch (err) {
    printError(err, globalFlags);
  }
}

async function handleLogsCommand(
  clients: ReturnType<typeof createClients>,
  subcommand: string,
  args: string[],
  flags: GlobalFlags
): Promise<void> {
  const parsed = parseArgs(args);

  switch (subcommand) {
    case "search": {
      const result = await searchLogs(clients.logsApi, {
        query: parsed.query ?? "*",
        from: parsed.from,
        to: parsed.to,
        limit: parsed.limit ? parseInt(parsed.limit, 10) : undefined,
        sort: parsed.sort as "timestamp" | "-timestamp" | undefined,
      });
      await outputResult(result, flags);
      break;
    }
    case "agg": {
      const facet = parsed.facet;
      if (!facet) {
        printError({ error: "Missing required --facet flag" }, flags);
        return;
      }
      const result = await aggregateLogs(clients.logsApi, {
        query: parsed.query ?? "*",
        facet,
        from: parsed.from,
        to: parsed.to,
      });
      await outputResult(result, flags);
      break;
    }
    case "tail": {
      console.log(`Tailing logs for query: ${parsed.query ?? "*"}`);
      console.log("Press Ctrl+C to stop\n");

      const tailer = tailLogs(clients.logsApi, {
        query: parsed.query ?? "*",
        onLog: (log) => printStreamingLog(log),
        onError: (err) => console.error(`Error: ${err.message}`),
        pollInterval: parsed.interval ? parseInt(parsed.interval, 10) * 1000 : 2000,
      });

      process.on("SIGINT", () => {
        tailer.stop();
        console.log("\nStopped tailing.");
        process.exit(0);
      });

      // Keep running
      await new Promise(() => {});
      break;
    }
    case "trace": {
      const traceId = parsed.id ?? parsed.trace;
      if (!traceId) {
        printError({ error: "Missing required --id or --trace flag" }, flags);
        return;
      }
      const result = await getLogsByTraceId(clients.logsApi, traceId, {
        from: parsed.from,
        to: parsed.to,
      });
      await outputResult(result, flags);
      break;
    }
    case "context": {
      if (!parsed.timestamp) {
        printError({ error: "Missing required --timestamp flag" }, flags);
        return;
      }
      const result = await getLogContext(clients.logsApi, {
        timestamp: parsed.timestamp,
        service: parsed.service,
        before: parsed.before,
        after: parsed.after,
      });
      await outputResult(result, flags);
      break;
    }
    case "patterns": {
      const result = await getLogPatterns(clients.logsApi, {
        query: parsed.query ?? "*",
        from: parsed.from,
        to: parsed.to,
        limit: parsed.limit ? parseInt(parsed.limit, 10) : undefined,
      });
      await outputResult(result, flags);
      break;
    }
    case "compare": {
      const period = parsed.period ?? "1h";
      const result = await comparePeriods(clients.logsApi, {
        query: parsed.query ?? "*",
        period,
      });
      await outputResult(result, flags);
      break;
    }
    case "multi": {
      const queriesRaw = parsed.queries;
      if (!queriesRaw) {
        printError({ error: "Missing required --queries flag (format: 'name1:query1,name2:query2')" }, flags);
        return;
      }
      const queries = queriesRaw.split(",").map((q) => {
        const [name, ...queryParts] = q.split(":");
        return { name: name!, query: queryParts.join(":"), from: parsed.from, to: parsed.to };
      });
      const result = await multiQuery(clients.logsApi, queries);
      await outputResult(result, flags);
      break;
    }
    default:
      printError(
        {
          error: `Unknown logs subcommand: ${subcommand}`,
          help: "Available: search, agg, tail, trace, context, patterns, compare, multi",
        },
        flags
      );
  }
}

async function handleMetricsCommand(
  clients: ReturnType<typeof createClients>,
  subcommand: string,
  args: string[],
  flags: GlobalFlags
): Promise<void> {
  const parsed = parseArgs(args);

  switch (subcommand) {
    case "query": {
      const query = parsed.query;
      if (!query) {
        printError({ error: "Missing required --query flag" }, flags);
        return;
      }
      const result = await queryMetrics(clients.metricsApi, {
        query,
        from: parsed.from,
        to: parsed.to,
      });
      await outputResult(result, flags);
      break;
    }
    default:
      printError(
        { error: `Unknown metrics subcommand: ${subcommand}`, help: "Available: query" },
        flags
      );
  }
}

async function handleErrorsCommand(
  clients: ReturnType<typeof createClients>,
  args: string[],
  flags: GlobalFlags
): Promise<void> {
  const parsed = parseArgs(args);
  const result = await getErrorSummary(clients.logsApi, {
    from: parsed.from,
    to: parsed.to,
    service: parsed.service,
  });
  await outputResult(result, flags);
}

async function handleServicesCommand(
  clients: ReturnType<typeof createClients>,
  args: string[],
  flags: GlobalFlags
): Promise<void> {
  const parsed = parseArgs(args);
  const result = await listServices(clients.logsApi, {
    from: parsed.from,
    to: parsed.to,
  });
  await outputResult(result, flags);
}

async function outputResult(data: unknown, flags: GlobalFlags): Promise<void> {
  if (flags.output) {
    await writeToFile(data, flags.output);
  }
  printOutput(data, flags);
}

// Helpers
function printUsage(): void {
  console.log(`datadog - CLI for debugging and triaging with Datadog logs and metrics

USAGE:
  datadog <command> [subcommand] [flags]

COMMANDS:
  logs search      Search logs with query filters
  logs agg         Aggregate logs by a facet
  logs tail        Stream logs in real-time (live tail)
  logs trace       Find all logs for a trace ID
  logs context     Get logs before/after a specific timestamp
  logs patterns    Group logs by message patterns
  logs compare     Compare log counts between time periods
  logs multi       Run multiple queries in parallel

  metrics query    Query timeseries metrics

  errors           Quick error summary (alias for logs with status:error)
  services         List all services with log activity

LOGS FLAGS:
  --query <query>     Log search query (default: "*")
  --from <time>       Start time (e.g., "1h", "30m", "7d", or ISO timestamp)
  --to <time>         End time (default: now)
  --limit <n>         Maximum logs to return (default: 100, max: 1000)
  --sort <order>      Sort order: "timestamp" or "-timestamp" (default: "-timestamp")
  --id <id>           Trace ID (for 'trace' command)
  --facet <facet>     Facet to aggregate by (for 'agg' command)
  --service <svc>     Filter by service
  --timestamp <ts>    Target timestamp (for 'context', required)
  --before <time>     Time before target (for 'context', default: 5m)
  --after <time>      Time after target (for 'context', default: 5m)
  --interval <sec>    Poll interval in seconds (for 'tail', default: 2)
  --period <time>     Comparison period (for 'compare', default: 1h)
  --queries <list>    Multiple queries (for 'multi', format: "name1:query1,name2:query2")

METRICS FLAGS:
  --query <query>     Metrics query (e.g., "avg:system.cpu.user{service:api}")
  --from <time>       Start time
  --to <time>         End time

GLOBAL FLAGS:
  --pretty            Human-readable output with colors (default: JSON)
  --output <file>     Write results to file
  --site <site>       Datadog site (e.g., datadoghq.eu, us5.datadoghq.com)

ENVIRONMENT:
  DD_API_KEY          Datadog API key (required)
  DD_APP_KEY          Datadog application key (required)

EXAMPLES:
  # Search and explore logs
  datadog logs search --query "status:error" --from 1h --pretty
  datadog logs agg --query "service:api" --facet status --from 24h --pretty

  # Real-time debugging
  datadog logs tail --query "service:api status:error" --pretty
  datadog logs trace --id "abc123def456" --pretty
  datadog logs context --timestamp "2024-01-15T10:30:00Z" --service api --before 5m --after 2m --pretty

  # Analysis and triage
  datadog errors --from 1h --pretty
  datadog errors --service api --from 24h --pretty
  datadog logs patterns --query "status:error" --from 1h --pretty
  datadog logs compare --query "status:error" --period 1h --pretty

  # Service discovery
  datadog services --from 24h --pretty

  # Metrics
  datadog metrics query --query "avg:system.cpu.user{*}" --from 1h --pretty

  # Export results
  datadog logs search --query "*" --limit 1000 --output logs.json
  datadog errors --from 24h --output errors.json --pretty

  # Multiple queries at once
  datadog logs multi --queries "errors:status:error,warnings:status:warn" --from 1h --pretty
`);
}

function extractGlobalFlags(args: string[]): GlobalFlags {
  const flags: GlobalFlags = { pretty: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pretty") {
      flags.pretty = true;
    } else if (args[i] === "--site" && args[i + 1]) {
      flags.site = args[i + 1];
    } else if (args[i] === "--output" && args[i + 1]) {
      flags.output = args[i + 1];
    }
  }

  return flags;
}

function parseArgs(args: string[]): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        result[key] = nextArg;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }

  return result;
}

main();
