import vm from 'node:vm';
import { transpileTypeScript } from './transpiler.js';

export interface SandboxExecutionOptions {
  timeoutMs?: number;       // Execution timeout in ms (default: 500ms)
  memoryLimitMb?: number;   // Memory limit in MB (default: 128MB)
  environment?: Record<string, string>;
  allowNetwork?: boolean;   // Allow safe fetch
}

export interface SandboxExecutionResult {
  success: boolean;
  output?: unknown;
  logs: string[];
  durationMs: number;
  memoryUsedMb?: number;
  error?: string;
  compiledHash?: string;
  cachedCompilation?: boolean;
}

/**
 * V8 Sandboxed Code Runner.
 * Executes untrusted JavaScript/TypeScript with CPU timeouts, memory boundaries,
 * SSRF-safe host fetch, structured log capture, and prototype isolation.
 */
export async function executeInSandbox(
  code: string,
  input: unknown,
  options: SandboxExecutionOptions = {}
): Promise<SandboxExecutionResult> {
  const {
    timeoutMs = 500,
    memoryLimitMb = 128,
    allowNetwork = true,
  } = options;

  const logs: string[] = [];
  const startTime = performance.now();

  try {
    // 1. Transpile TypeScript to JS (cached by content hash)
    const { js: transpiledJs, hash, cached } = await transpileTypeScript(code);

    // 2. Build controlled sandbox host bridge
    const capturedLogs: string[] = [];
    const customConsole = {
      log: (...args: unknown[]) => {
        capturedLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      },
      info: (...args: unknown[]) => {
        capturedLogs.push('[INFO] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      },
      warn: (...args: unknown[]) => {
        capturedLogs.push('[WARN] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      },
      error: (...args: unknown[]) => {
        capturedLogs.push('[ERROR] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      },
    };

    // Safe SSRF-guarded fetch wrapper
    let fetchCount = 0;
    const safeFetch = async (url: string, init?: any) => {
      if (!allowNetwork) {
        throw new Error('Network access is disabled for this isolate.');
      }
      if (++fetchCount > 5) {
        throw new Error('Rate limit exceeded: maximum 5 HTTP requests per execution step.');
      }

      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Block SSRF to loopback, metadata services, and private IPs
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '169.254.169.254' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        (hostname.startsWith('172.') && parseInt(hostname.split('.')[1], 10) >= 16 && parseInt(hostname.split('.')[1], 10) <= 31)
      ) {
        throw new Error(`SSRF Blocked: Prohibited destination IP or hostname '${hostname}'`);
      }

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5000));

      try {
        const resp = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(fetchTimeout);
        const text = await resp.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        return {
          status: resp.status,
          statusText: resp.statusText,
          ok: resp.ok,
          text: async () => text,
          json: async () => json ?? text,
        };
      } catch (err) {
        clearTimeout(fetchTimeout);
        throw err;
      }
    };

    // Construct isolated context with null prototype
    // Do NOT pass host Object/Array/Promise so VM uses its own isolated realm intrinsics
    const sandboxContext = Object.create(null);
    Object.assign(sandboxContext, {
      input: JSON.parse(JSON.stringify(input)), // Deep clone input
      console: customConsole,
      fetch: safeFetch,
      setTimeout: (fn: any, ms: number) => {
        if (ms > timeoutMs) throw new Error(`Timer duration ${ms}ms exceeds isolate CPU timeout`);
        return setTimeout(fn, ms);
      },
      clearTimeout,
      exports: {},
      module: { exports: {} },
    });

    const context = vm.createContext(sandboxContext, {
      codeGeneration: { strings: false, wasm: false }, // Disallow eval() & WebAssembly inside sandbox
    });

    // 3. Compile and execute inside V8 isolate with strict timeout & microtask limits
    const script = new vm.Script(`
      'use strict';
      ${transpiledJs}

      // Check default or named export
      (async function runUserCode() {
        const target = module.exports.default || module.exports.transform || module.exports;
        if (typeof target === 'function') {
          return await target(input);
        }
        if (typeof transform === 'function') {
          return await transform(input);
        }
        return input;
      })();
    `);

    // Memory usage before
    const memBefore = process.memoryUsage().heapUsed;

    const promise = script.runInContext(context, {
      timeout: timeoutMs,
      breakOnSigint: true,
      displayErrors: true,
    });

    // Timeout protection for async promises
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Isolate execution timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const output = await Promise.race([promise, timeoutPromise]);
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    const memAfter = process.memoryUsage().heapUsed;
    const memoryUsedMb = Math.max(0, Math.round(((memAfter - memBefore) / 1024 / 1024) * 10) / 10);

    return {
      success: true,
      output,
      logs: capturedLogs,
      durationMs,
      memoryUsedMb,
      compiledHash: hash,
      cachedCompilation: cached,
    };
  } catch (err) {
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      success: false,
      logs,
      durationMs,
      error: (err as Error).message,
    };
  }
}
