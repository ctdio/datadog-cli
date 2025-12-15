---
description: Quick reference for Datadog CLI commands
---

Show me a quick reference of Datadog CLI commands. Include:

1. **Log Search**: `datadog logs search --query "<query>" --from <time>`
2. **Log Aggregation**: `datadog logs agg --query "<query>" --facet <facet> --from <time>`
3. **Metrics Query**: `datadog metrics query --query "<metrics-query>" --from <time>`

Common examples:
- Search errors: `datadog logs search --query "status:error" --from 1h`
- Count by service: `datadog logs agg --query "*" --facet service --from 1h`
- CPU usage: `datadog metrics query --query "avg:system.cpu.user{*}" --from 1h`

Remind me that `DD_API_KEY` and `DD_APP_KEY` environment variables must be set.
