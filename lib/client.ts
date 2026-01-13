import { client, v1, v2 } from "@datadog/datadog-api-client";

// Types
interface DatadogClients {
  logsApi: v2.LogsApi;
  metricsApi: v1.MetricsApi;
  spansApi: v2.SpansApi;
}

// Main exports
export function createClients(site?: string): DatadogClients {
  validateEnvVars();

  const configuration = client.createConfiguration({
    ...(site && {
      baseServer: new client.BaseServerConfiguration(
        `https://api.${site}`,
        {}
      ),
    }),
  });

  return {
    logsApi: new v2.LogsApi(configuration),
    metricsApi: new v1.MetricsApi(configuration),
    spansApi: new v2.SpansApi(configuration),
  };
}

export function validateEnvVars(): void {
  const apiKey = process.env.DD_API_KEY;
  const appKey = process.env.DD_APP_KEY;

  if (!apiKey || !appKey) {
    const missing: string[] = [];
    if (!apiKey) missing.push("DD_API_KEY");
    if (!appKey) missing.push("DD_APP_KEY");

    console.error(JSON.stringify({
      error: "Missing required environment variables",
      missing,
      help: "Set DD_API_KEY and DD_APP_KEY environment variables. Get keys from https://app.datadoghq.com/organization-settings/api-keys",
    }));
    process.exit(1);
  }
}
