import * as esbuild from 'esbuild';
import crypto from 'node:crypto';

// In-memory compilation cache indexed by SHA-256 hash of TypeScript source code
const compilationCache = new Map<string, string>();

/**
 * Transpiles user TypeScript code into pure JavaScript on the fly.
 * Uses content-hash caching so repeated executions compile in 0ms.
 */
export async function transpileTypeScript(code: string): Promise<{ js: string; hash: string; cached: boolean }> {
  const hash = crypto.createHash('sha256').update(code).digest('hex');

  const cached = compilationCache.get(hash);
  if (cached) {
    return { js: cached, hash, cached: true };
  }

  // Live transform with esbuild
  const result = await esbuild.transform(code, {
    loader: 'ts',
    target: 'es2022',
    format: 'cjs',
    minify: false,
  });

  const js = result.code;
  compilationCache.set(hash, js);

  return { js, hash, cached: false };
}

export function clearCompilationCache(): void {
  compilationCache.clear();
}
