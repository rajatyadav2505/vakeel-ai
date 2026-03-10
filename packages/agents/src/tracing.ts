import { getAgentsEnv } from './env';

export function traceRun<T>(params: {
  runName: string;
  input: unknown;
  executor: () => Promise<T>;
}): Promise<T> {
  const tracingEnabled = getAgentsEnv().LANGCHAIN_TRACING_V2 === 'true';
  if (tracingEnabled) {
    // LangSmith SDK can be added here for richer traces.
    // Keeping this abstraction makes the orchestrator edge-safe.
    console.info(`[langsmith] run=${params.runName}`, params.input);
  }
  return params.executor();
}
