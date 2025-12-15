#!/usr/bin/env bun

import { createClients } from "./lib/client";
import { searchLogs, getLogById, aggregateLogs } from "./lib/logs";
import { queryMetrics } from "./lib/metrics";
import { printOutput, printError } from "./lib/output";

// Types
interface GlobalFlags {
  pretty: boolean;
  site?: string;
}

// Main CLI entrypoint
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    return;
  }

  const globalFlags = extractGlobalFlags(args);
  const [command, subcommand, ...rest] = args.filter(
    (arg) => !arg.startsWith("--pretty") && !arg.startsWith("--site")
  );

  try {
    const clients = createClients(globalFlags.site);

    if (command === "logs") {
      await handleLogsCommand(clients, subcommand ?? "", rest, globalFlags);
    } else if (command === "metrics") {
      await handleMetricsCommand(clients, subcommand ?? "", rest, globalFlags);
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
      printOutput(result, flags);
      break;
    }
    case "get": {
      const id = parsed.id;
      if (!id) {
        printError({ error: "Missing required --id flag" }, flags);
        return;
      }
      const result = await getLogById(clients.logsApi, id);
      if (!result) {
        printError({ error: `Log not found: ${id}` }, flags);
        return;
      }
      printOutput(result, flags);
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
      printOutput(result, flags);
      break;
    }
    default:
      printError(
        { error: `Unknown logs subcommand: ${subcommand}`, help: "Available: search, get, agg" },
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
      printOutput(result, flags);
      break;
    }
    default:
      printError(
        { error: `Unknown metrics subcommand: ${subcommand}`, help: "Available: query" },
        flags
      );
  }
}

// Helpers
function printUsage(): void {
  console.log(`datadog - CLI for exploring Datadog logs and metrics

USAGE:
  datadog <command> <subcommand> [flags]

COMMANDS:
  logs search    Search logs with query filters
  logs get       Get details of a specific log by ID
  logs agg       Aggregate logs by a facet

  metrics query  Query timeseries metrics

LOGS FLAGS:
  --query <query>   Log search query (default: "*")
  --from <time>     Start time (e.g., "1h", "30m", "7d", or ISO timestamp)
  --to <time>       End time (default: now)
  --limit <n>       Maximum logs to return (default: 100, max: 1000)
  --sort <order>    Sort order: "timestamp" or "-timestamp" (default: "-timestamp")
  --id <id>         Log ID (for 'get' command)
  --facet <facet>   Facet to aggregate by (for 'agg' command)

METRICS FLAGS:
  --query <query>   Metrics query (e.g., "avg:system.cpu.user{service:api}")
  --from <time>     Start time
  --to <time>       End time

GLOBAL FLAGS:
  --pretty          Human-readable output (default: JSON)
  --site <site>     Datadog site (e.g., datadoghq.eu, us5.datadoghq.com)

ENVIRONMENT:
  DD_API_KEY        Datadog API key (required)
  DD_APP_KEY        Datadog application key (required)

EXAMPLES:
  datadog logs search --query "status:error" --from 1h
  datadog logs get --id "AQAAAZPx..."
  datadog logs agg --query "service:api" --facet status --from 24h
  datadog metrics query --query "avg:system.cpu.user{*}" --from 1h
  datadog logs search --query "*" --limit 10 --pretty
`);
}

function extractGlobalFlags(args: string[]): GlobalFlags {
  const flags: GlobalFlags = { pretty: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pretty") {
      flags.pretty = true;
    } else if (args[i] === "--site" && args[i + 1]) {
      flags.site = args[i + 1];
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
