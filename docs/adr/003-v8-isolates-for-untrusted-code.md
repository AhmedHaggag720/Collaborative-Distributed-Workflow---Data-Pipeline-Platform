# ADR 003: V8 Isolate Sandboxing for Untrusted Multi-Tenant Code Execution

## Context & Problem Statement
Users author custom JavaScript/TypeScript data transformations inside "JS Code Transform" nodes. Executing untrusted user code poses critical security and stability risks:
- Denial of Service (DoS) via `while (true) {}` infinite loops.
- Out of Memory (OOM) crashing the host worker process.
- Server-Side Request Forgery (SSRF) targeting cloud metadata services (`169.254.169.254`) and internal VPC services.
- Prototype pollution escaping the sandbox and compromising host Node.js intrinsics.

## Decision Drivers
* Sub-millisecond cold starts for fast event transformation.
* Hard memory and CPU enforcement.
* Absolute host isolation from arbitrary filesystem, process, and network access.

## Considered Options
1. **Docker / microVMs (Firecracker / gVisor):** Heavy container sandboxing.
2. **Node.js `vm` module:** Standard Node context execution without memory enforcement.
3. **V8 Isolates (`isolated-vm` / isolated context engines):** Dedicated V8 heap per isolate with strict resource ceilings.

## Decision Outcome
Chosen option: **V8 Isolates with `esbuild` Ahead-Of-Time Transpilation**, because:
- **Sub-10ms Startup Time:** Spin-up time is $< 2\text{ms}$ per isolate compared to $> 150\text{ms}$ for microVMs and $> 1.5\text{s}$ for Docker containers.
- **Hard Resource Ceilings:** CPU execution timeout enforced within $\pm 10\text{ms}$ (500ms default) and strict memory ceiling (128MB heap limit).
- **Zero Prototype Leakage:** Host `Object`, `Array`, and `Function` prototypes are decoupled from the isolate context. The isolate operates exclusively on its internal intrinsics.
- **SSRF Network Guard:** Outbound HTTP requests pass through an address sanitizer that immediately blocks loopback (`127.0.0.1`), private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and AWS/GCP instance metadata endpoints (`169.254.169.254`).
- **Content-Hash Caching:** User TypeScript is transpiled to JS using `esbuild` and cached by SHA-256 code hash, avoiding repetitive compilation on warm iterations.

## Consequences
- Binary dependencies must compile for the target host OS architecture.
