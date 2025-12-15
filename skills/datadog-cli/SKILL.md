---
name: datadog-cli
description: |
  Datadog CLI for exploring logs and metrics. Use this skill when you need to:
  search Datadog logs, query metrics, aggregate log data, investigate errors,
  check service health, or analyze observability data. Trigger phrases include
  "search logs", "query metrics", "check Datadog", "find errors in logs",
  "CPU usage", "memory stats", "service health".
---

# Datadog CLI Reference

A CLI tool for AI agents to explore Datadog logs and metrics programmatically.

## Setup

### Environment Variables (Required)

```bash
export DD_API_KEY="your-api-key"
export DD_APP_KEY="your-app-key"
```

Get keys from: https://app.datadoghq.com/organization-settings/api-keys

### For Non-US Datadog Sites

Use `--site` flag:
```bash
datadog logs search --query "*" --site datadoghq.eu
datadog logs search --query "*" --site us5.datadoghq.com
```

## Commands

### Log Search

Search logs with query filters.

```bash
datadog logs search --query "<query>" [--from <time>] [--to <time>] [--limit <n>] [--sort <order>]
```

**Flags:**
- `--query` - Datadog log search query (default: `*`)
- `--from` - Start time: `1h`, `30m`, `7d`, or ISO timestamp
- `--to` - End time (default: now)
- `--limit` - Max logs to return (default: 100, max: 1000)
- `--sort` - `timestamp` (oldest first) or `-timestamp` (newest first, default)

**Examples:**
```bash
# Search for errors in the last hour
datadog logs search --query "status:error" --from 1h

# Search specific service
datadog logs search --query "service:api-gateway" --from 30m --limit 50

# Search by log level
datadog logs search --query "status:warn OR status:error" --from 2h

# Full-text search
datadog logs search --query "connection refused" --from 1h

# Combined filters
datadog logs search --query "service:payment-api status:error @http.status_code:500" --from 1h
```

### Get Log by ID

Retrieve a specific log entry by ID.

```bash
datadog logs get --id "<log-id>"
```

**Example:**
```bash
datadog logs get --id "AQAAAZPxAbCdEfGh..."
```

### Log Aggregation

Aggregate logs by a facet to see counts and patterns.

```bash
datadog logs agg --query "<query>" --facet <facet> [--from <time>] [--to <time>]
```

**Common facets:**
- `status` - Log level (error, warn, info, debug)
- `service` - Service name
- `host` - Host name
- `@http.status_code` - HTTP status codes
- `@error.kind` - Error types

**Examples:**
```bash
# Count logs by status
datadog logs agg --query "*" --facet status --from 1h

# Count errors by service
datadog logs agg --query "status:error" --facet service --from 24h

# Count by HTTP status code
datadog logs agg --query "service:api" --facet @http.status_code --from 1h

# Count errors by error type
datadog logs agg --query "status:error" --facet @error.kind --from 6h
```

### Metrics Query

Query timeseries metrics with any valid Datadog metrics query.

```bash
datadog metrics query --query "<metrics-query>" [--from <time>] [--to <time>]
```

**Query format:** `<aggregation>:<metric>{<tags>}`

**Common aggregations:** `avg`, `sum`, `min`, `max`, `count`

**Examples:**
```bash
# Average CPU usage across all hosts
datadog metrics query --query "avg:system.cpu.user{*}" --from 1h

# CPU by service
datadog metrics query --query "avg:system.cpu.user{service:api}" --from 1h

# Memory usage
datadog metrics query --query "avg:system.mem.used{*}" --from 1h

# Memory by host
datadog metrics query --query "avg:system.mem.used{*} by {host}" --from 1h

# Request rate
datadog metrics query --query "sum:trace.http.request.hits{service:api}.as_count()" --from 1h

# Error rate
datadog metrics query --query "sum:trace.http.request.errors{service:api}.as_count()" --from 1h

# P95 latency
datadog metrics query --query "avg:trace.http.request.duration.by.service.95p{service:api}" --from 1h
```

## Output Format

**Default:** JSON (optimized for AI agent parsing)

```bash
datadog logs search --query "*" --limit 5
```

**Human-readable:** Add `--pretty` flag

```bash
datadog logs search --query "*" --limit 5 --pretty
```

## Response Structure

### Log Search Response

```json
{
  "logs": [
    {
      "id": "AQAAAZPx...",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "service": "api-gateway",
      "status": "error",
      "message": "Connection refused",
      "attributes": { ... }
    }
  ],
  "meta": {
    "total": 42,
    "cursor": "eyJhZnRl...",
    "timeRange": { "from": "...", "to": "..." }
  }
}
```

### Aggregation Response

```json
{
  "buckets": [
    { "key": "error", "count": 150 },
    { "key": "warn", "count": 89 },
    { "key": "info", "count": 1024 }
  ],
  "meta": {
    "timeRange": { "from": "...", "to": "..." }
  }
}
```

### Metrics Response

```json
{
  "series": [
    {
      "metric": "system.cpu.user",
      "scope": "service:api",
      "pointlist": [
        { "timestamp": 1705312200, "value": 45.2 },
        { "timestamp": 1705312260, "value": 47.8 }
      ],
      "tags": ["service:api", "env:production"]
    }
  ],
  "meta": {
    "query": "avg:system.cpu.user{service:api}",
    "timeRange": { "from": 1705308600, "to": 1705312200 }
  }
}
```

## Common Workflows

### Investigate an Error

```bash
# 1. Find recent errors
datadog logs search --query "status:error" --from 1h --limit 20

# 2. Narrow down by service
datadog logs search --query "status:error service:payment-api" --from 1h

# 3. See error distribution
datadog logs agg --query "status:error" --facet @error.kind --from 1h

# 4. Check if service is under load
datadog metrics query --query "avg:system.cpu.user{service:payment-api}" --from 1h
```

### Check Service Health

```bash
# 1. Check for errors
datadog logs agg --query "service:api" --facet status --from 1h

# 2. Check CPU/memory
datadog metrics query --query "avg:system.cpu.user{service:api}" --from 1h
datadog metrics query --query "avg:system.mem.used{service:api}" --from 1h

# 3. Check request rate and errors
datadog metrics query --query "sum:trace.http.request.hits{service:api}.as_count()" --from 1h
datadog metrics query --query "sum:trace.http.request.errors{service:api}.as_count()" --from 1h
```

### Debug a Specific Request

```bash
# Search by trace ID
datadog logs search --query "@trace_id:abc123" --from 1h

# Search by request ID
datadog logs search --query "@request_id:req-456" --from 1h
```

## Datadog Query Syntax Reference

### Log Query Operators

| Operator | Example | Description |
|----------|---------|-------------|
| `AND` | `service:api status:error` | Both conditions (default) |
| `OR` | `status:error OR status:warn` | Either condition |
| `NOT` / `-` | `-status:info` | Exclude |
| `*` | `service:api-*` | Wildcard |
| `>` `<` `>=` `<=` | `@http.status_code:>=400` | Numeric comparison |
| `[TO]` | `@duration:[1000 TO 5000]` | Range |

### Common Log Attributes

- `service` - Service name
- `host` - Hostname
- `status` - Log level (error, warn, info, debug)
- `@http.method` - HTTP method
- `@http.status_code` - HTTP status code
- `@http.url` - Request URL
- `@error.kind` - Error type
- `@error.message` - Error message
- `@duration` - Request duration
- `@trace_id` - Trace ID
