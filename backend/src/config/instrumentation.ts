import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

export const sdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});

sdk.start();