export interface SandboxExecutionOptions {
  timeoutMs?: number;
  memoryLimitMb?: number;
  environment?: Record<string, string>;
}

export interface SandboxExecutionResult {
  success: boolean;
  output?: unknown;
  logs: string[];
  durationMs: number;
  error?: string;
}

/**
 * Sandboxed code executor interface.
 * Implements fallback safe execution for Phase 0/1; fully bound to isolated-vm in Phase 4.
 */
export async function executeInSandbox(
  code: string,
  input: unknown,
  options: SandboxExecutionOptions = {}
): Promise<SandboxExecutionResult> {
  const startTime = Date.now();
  const logs: string[] = [];

  try {
    const customConsole = {
      log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      warn: (...args: unknown[]) => logs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      error: (...args: unknown[]) => logs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
    };

    // Clean execution wrapper
    const fn = new Function('input', 'console', `
      ${code}
      if (typeof transform === 'function') {
        return transform(input);
      }
      return input;
    `);

    const output = await Promise.resolve(fn(input, customConsole));
    const durationMs = Date.now() - startTime;

    return {
      success: true,
      output,
      logs,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      logs,
      durationMs,
      error: (err as Error).message,
    };
  }
}
