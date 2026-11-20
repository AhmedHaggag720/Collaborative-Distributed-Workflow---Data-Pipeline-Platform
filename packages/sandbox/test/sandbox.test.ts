import assert from 'node:assert';
import { executeInSandbox, transpileTypeScript, clearCompilationCache } from '../src/index.js';

console.log('Running Phase 4 Sandboxed Code Execution verification tests...');

async function runTests() {
  clearCompilationCache();

  // Test 1: TypeScript Transpilation & Caching
  const tsCode = `
    interface OrderInput {
      id: string;
      total: number;
    }

    export default async function transform(input: OrderInput) {
      console.log('Processing order:', input.id);
      return {
        orderId: input.id,
        taxCents: Math.round(input.total * 0.15 * 100),
        processed: true
      };
    }
  `;

  // First execution: compiles TS and caches hash
  const res1 = await executeInSandbox(tsCode, { id: 'ord_123', total: 50.0 });
  assert.strictEqual(res1.success, true, 'First TS run should succeed');
  assert.strictEqual((res1.output as any).orderId, 'ord_123');
  assert.strictEqual((res1.output as any).taxCents, 750);
  assert.strictEqual(res1.cachedCompilation, false, 'First run is a cache miss');
  assert.strictEqual(res1.logs.length, 1);
  console.log('✓ TypeScript transpilation and structured console.log capture verified.');

  // Second execution: must hit compilation cache
  const res2 = await executeInSandbox(tsCode, { id: 'ord_456', total: 100.0 });
  assert.strictEqual(res2.success, true);
  assert.strictEqual((res2.output as any).orderId, 'ord_456');
  assert.strictEqual(res2.cachedCompilation, true, 'Second run must hit compiled SHA-256 cache');
  console.log('✓ Content-hash SHA-256 compilation cache verified.');

  // Test 2: Infinite Loop Timeout Guardrail
  const infiniteLoopCode = `
    export default async function transform(input: any) {
      let i = 0;
      while (true) {
        i++;
      }
      return i;
    }
  `;

  const loopStart = performance.now();
  const loopRes = await executeInSandbox(infiniteLoopCode, {}, { timeoutMs: 300 });
  const loopElapsed = performance.now() - loopStart;

  assert.strictEqual(loopRes.success, false, 'Infinite loop must be terminated');
  assert(loopRes.error?.includes('timed out'), `Error should mention timeout: ${loopRes.error}`);
  assert(loopElapsed < 1500, `Worker should not hang (terminated in ${loopElapsed}ms)`);
  console.log(`✓ Infinite loop timeout protection verified (cleanly aborted in ${Math.round(loopElapsed)}ms).`);

  // Test 3: SSRF Prevention
  const ssrfCode = `
    export default async function transform() {
      return await fetch('http://169.254.169.254/latest/meta-data');
    }
  `;
  const ssrfRes = await executeInSandbox(ssrfCode, {});
  assert.strictEqual(ssrfRes.success, false);
  assert(ssrfRes.error?.includes('SSRF Blocked'), `Error must report SSRF Blocked: ${ssrfRes.error}`);
  console.log('✓ SSRF Protection against cloud metadata & loopback verified.');

  // Test 4: Host Prototype Isolation
  const pollutionCode = `
    export default async function transform() {
      // @ts-ignore
      Object.prototype.polluted = 'pawned';
      return true;
    }
  `;
  await executeInSandbox(pollutionCode, {});
  // Check host Object prototype
  assert.strictEqual((Object.prototype as any).polluted, undefined, 'Host prototype must remain pristine');
  console.log('✓ Sandbox prototype pollution isolation verified.');

  console.log('All Phase 4 Sandboxed Multi-Tenant Execution tests PASSED cleanly!');
}

runTests().catch((err) => {
  console.error('Phase 4 test failure:', err);
  process.exit(1);
});
