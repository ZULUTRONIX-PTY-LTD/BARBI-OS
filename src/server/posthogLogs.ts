import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';

const posthogKey = process.env.VITE_POSTHOG_KEY;
const posthogHost = process.env.VITE_POSTHOG_HOST;

if ((!posthogKey || !posthogHost) && process.env.NODE_ENV !== 'production') {
  console.warn(
    !posthogKey
      ? 'VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured'
      : 'VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured'
  );
}

const loggerProvider =
  posthogKey && posthogHost
    ? new LoggerProvider({
        resource: resourceFromAttributes({
          'service.name': 'barbi-os-server',
          'deployment.environment': process.env.NODE_ENV || 'development',
        }),
        processors: [
          new BatchLogRecordProcessor(
            new OTLPLogExporter({
              url: `${posthogHost.replace(/\/$/, '')}/i/v1/logs`,
              headers: { Authorization: `Bearer ${posthogKey}` },
            })
          ),
        ],
      })
    : null;

const posthogLogger = loggerProvider?.getLogger('barbi-os-posthog-logs');

export function emitPostHogLog(
  severityText: 'INFO' | 'WARN' | 'ERROR',
  body: string,
  attributes: Record<string, string | number | boolean> = {}
): void {
  try {
    posthogLogger?.emit({ severityText, body, attributes });
  } catch {
    // Log export must never affect application work.
  }
}

export async function shutdownPostHogLogs(): Promise<void> {
  try {
    await loggerProvider?.shutdown();
  } catch {
    // A failed export must not block application shutdown.
  }
}
