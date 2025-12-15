# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A CLI tool for debugging and triaging with Datadog logs and metrics. Built with Bun and the `@datadog/datadog-api-client` library.

## Commands

```bash
bun install          # Install dependencies
bun run cli.ts       # Run CLI
bun run build        # Build standalone binary to dist/datadog
bun run tsc --noEmit # Type check
```

## Architecture

```
cli.ts              # CLI entrypoint - command parsing, routing to handlers
lib/
  client.ts         # Datadog API client initialization, env var validation
  logs.ts           # Log operations (search, tail, trace, context, patterns, etc.)
  metrics.ts        # Metrics queries
  output.ts         # Formatters and pretty printing with ANSI colors
```

**Data flow:** CLI parses args → creates Datadog clients → calls lib functions → formats output

## Key Patterns

- All lib functions take the API client as first parameter
- Time ranges support relative formats (`1h`, `30m`, `7d`) and ISO timestamps
- `--pretty` flag enables color-coded human-readable output; default is JSON
- Environment variables `DD_API_KEY` and `DD_APP_KEY` are required

## Bun-Specific

- Use `bun` instead of `node`, `npm`, `ts-node`
- Use `Bun.write()` for file operations
- Bun auto-loads `.env` files
