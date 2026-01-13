# datadog-cli

A CLI for querying Datadog logs, metrics, and APM traces from your terminal.

## Why?

I wanted a tool that Claude (and other AI assistants) could use to help investigate production issues. Figured I'd vibe my own because why not.

## Features

- **Log Search & Exploration** - Search, filter, and aggregate logs
- **Live Tail** - Stream logs in real-time
- **Trace Correlation** - Find all logs for a distributed trace
- **Context View** - See logs before/after a specific event
- **Error Summary** - Quick breakdown of errors by service and type
- **Period Comparison** - Compare log volumes between time periods
- **Pattern Detection** - Group similar log messages
- **Metrics Query** - Query timeseries metrics
- **APM Traces & Spans** - Search spans, view trace hierarchies, find slow requests
- **Span Error Analysis** - Error breakdown by service and resource
- **Service Discovery** - List all services with log/trace activity
- **Export** - Save results to JSON files
- **Pretty Output** - Color-coded, human-readable formatting

## Installation

Run directly without installing:

```bash
npx @ctdio/datadog-cli <command>
# or
bunx @ctdio/datadog-cli <command>
```

Or install locally:

```bash
bun install
```

## Claude Code Plugin

Install as a [Claude Code](https://claude.ai/code) plugin to give Claude knowledge of the CLI:

```bash
# Add the marketplace (one-time)
/plugin marketplace add ctdio/datadog-cli

# Install the plugin
/plugin install datadog-cli
```

Once installed, Claude can help you debug with Datadog:
- "Search my Datadog logs for errors in the last hour"
- "Compare error rates to the previous period"
- "Why did the app crash at 1:30pm ET?"

## Setup

Set your Datadog API credentials:

```bash
export DD_API_KEY="your-api-key"
export DD_APP_KEY="your-app-key"
```

Get keys from: https://app.datadoghq.com/organization-settings/api-keys

For EU or other sites:
```bash
export DD_SITE="datadoghq.eu"  # or us5.datadoghq.com, etc.
```

## Usage

```bash
bun run cli.ts <command> [subcommand] [flags]
```

Or create an alias:
```bash
alias datadog="bun run /path/to/cli.ts"
```

## Commands

### Log Search & Exploration

```bash
# Search logs
datadog logs search --query "status:error" --from 1h --pretty

# Aggregate logs by facet
datadog logs agg --query "service:api" --facet status --from 24h --pretty
```

### Real-time Debugging

```bash
# Live tail - stream logs as they come in
datadog logs tail --query "service:api status:error" --pretty

# Find all logs for a trace
datadog logs trace --id "abc123def456" --pretty

# Get context around a timestamp (before/after)
datadog logs context --timestamp "2024-01-15T10:30:00Z" --service api --before 5m --after 2m --pretty
```

### Analysis & Triage

```bash
# Quick error summary
datadog errors --from 1h --pretty

# Error summary for specific service
datadog errors --service api --from 24h --pretty

# Detect log patterns
datadog logs patterns --query "status:error" --from 1h --pretty

# Compare current vs previous period
datadog logs compare --query "status:error" --period 1h --pretty
```

### Service Discovery

```bash
# List all services with recent log activity
datadog services --from 24h --pretty
```

### Metrics

```bash
# Query metrics
datadog metrics query --query "avg:system.cpu.user{*}" --from 1h --pretty
```

### APM Traces & Spans

```bash
# Search spans
datadog spans search --query "env:prod service:api" --from 1h --pretty

# Find slow requests (over 1 second)
datadog spans search --query "service:api" --min-duration 1s --from 1h --pretty

# Aggregate spans by facet
datadog spans agg --query "env:prod" --facet service --from 24h --pretty

# View trace hierarchy (parent-child relationships)
datadog spans trace --id "abc123def456" --pretty

# Span error summary
datadog spans errors --from 1h --pretty
datadog spans errors --service api --from 24h --pretty

# List services with APM activity
datadog spans services --from 24h --pretty
```

### Export & Multi-query

```bash
# Export results to file
datadog logs search --query "*" --limit 1000 --output logs.json

# Run multiple queries at once
datadog logs multi --queries "errors:status:error,warnings:status:warn" --from 1h --pretty
```

## Flags Reference

### Log Flags
| Flag | Description | Default |
|------|-------------|---------|
| `--query <query>` | Log search query | `*` |
| `--from <time>` | Start time (e.g., `1h`, `30m`, `7d`, ISO timestamp) | 15m |
| `--to <time>` | End time | now |
| `--limit <n>` | Max logs to return | 100 |
| `--sort <order>` | `timestamp` or `-timestamp` | `-timestamp` |
| `--id <id>` | Trace ID (for `trace` command) | - |
| `--facet <facet>` | Facet for aggregation | - |
| `--service <svc>` | Filter by service | - |
| `--timestamp <ts>` | Target timestamp (for `context`) | - |
| `--before <time>` | Context: time before target | 5m |
| `--after <time>` | Context: time after target | 5m |
| `--interval <sec>` | Tail: poll interval | 2 |
| `--period <time>` | Compare: comparison period | 1h |

### Metrics Flags
| Flag | Description |
|------|-------------|
| `--query <query>` | Metrics query (e.g., `avg:system.cpu.user{service:api}`) |
| `--from <time>` | Start time |
| `--to <time>` | End time |

### Spans Flags
| Flag | Description | Default |
|------|-------------|---------|
| `--query <query>` | Span search query (e.g., `env:prod service:api`) | `*` |
| `--from <time>` | Start time | 15m |
| `--to <time>` | End time | now |
| `--limit <n>` | Max spans to return | 100 |
| `--sort <order>` | `timestamp` or `-timestamp` | `-timestamp` |
| `--min-duration <d>` | Filter slow spans (e.g., `100ms`, `1s`, `500us`) | - |
| `--id <id>` | Trace ID (for `trace` command) | - |
| `--facet <facet>` | Facet for aggregation | - |
| `--service <svc>` | Filter by service (for `errors`) | - |

### Global Flags
| Flag | Description |
|------|-------------|
| `--pretty` | Human-readable output with colors |
| `--output <file>` | Write results to JSON file |
| `--site <site>` | Datadog site (e.g., `datadoghq.eu`) |

## Time Formats

- Relative: `30m`, `1h`, `7d`, `24h`
- ISO 8601: `2024-01-15T10:30:00Z`

## Examples

### Incident Triage Workflow

```bash
# 1. Check error summary (logs and spans)
datadog errors --from 1h --pretty
datadog spans errors --from 1h --pretty

# 2. Compare to previous period
datadog logs compare --query "status:error" --period 1h --pretty

# 3. Find error patterns
datadog logs patterns --query "status:error" --from 1h --pretty

# 4. Search specific errors
datadog logs search --query "status:error service:api" --from 1h --pretty

# 5. Find slow requests
datadog spans search --query "service:api" --min-duration 1s --from 1h --pretty

# 6. Get context around a timestamp
datadog logs context --timestamp "2024-01-15T10:30:00Z" --service api --before 5m --after 2m --pretty

# 7. Follow the trace (logs and spans)
datadog logs trace --id "TRACE_ID" --pretty
datadog spans trace --id "TRACE_ID" --pretty
```

### Monitoring Workflow

```bash
# Stream errors in real-time
datadog logs tail --query "status:error" --pretty

# Watch specific service
datadog logs tail --query "service:payment-api" --pretty
```

## Output Formats

### JSON (default)
```bash
datadog logs search --query "*" --limit 10
```

### Pretty (human-readable with colors)
```bash
datadog logs search --query "*" --limit 10 --pretty
```

Pretty output includes:
- Color-coded log levels (ERR, WRN, INF, DBG)
- Timestamps with milliseconds
- Service names highlighted
- Trace ID snippets
- Bar charts for aggregations
- Trend indicators for comparisons

## Requirements

- [Bun](https://bun.sh) runtime
- Datadog API key and Application key
