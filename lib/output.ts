// Types
interface OutputOptions {
  pretty?: boolean;
}

// Main exports
export function formatOutput(data: unknown, options: OutputOptions = {}): string {
  if (options.pretty) {
    return formatPretty(data);
  }
  return JSON.stringify(data);
}

export function printOutput(data: unknown, options: OutputOptions = {}): void {
  console.log(formatOutput(data, options));
}

export function printError(error: unknown, options: OutputOptions = {}): void {
  const errorData = normalizeError(error);
  console.error(formatOutput(errorData, options));
  process.exit(1);
}

// Helpers
function formatPretty(data: unknown): string {
  return JSON.stringify(data, null, 2);
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
