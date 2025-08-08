// lib/runtime/createService.ts
import { GenericContainer, StartedTestContainer } from "testcontainers";
import { toxiproxyManager } from "./toxiproxyManager";
import {
  registerCleanup,
  cleanupAfterEachTest,
  cleanupAfterSuite,
} from "./registry";
import { runtimeState } from "./runtimeState";

type Scope = "test" | "suite";

type ServiceOpts = {
  image: string;
  ports?: number[];
  environment?: Record<string, string>;
  proxy?: boolean; // if true, expose `proxyAddr(port)`
  scope?: Scope; // default 'test'
  alias?: string; // network alias (default = name)
};

export type ServiceHandle = {
  name: string;
  container: StartedTestContainer;
  /** host URL for the first (or provided) exposed port (for hitting from the test process) */
  url: (p?: number) => string;
  /** container-to-container address via toxiproxy (returns `${toxiproxyAlias}:${listenPort}`) */
  proxyAddr?: (upstreamPort?: number, listenPort?: number) => Promise<string>;
};

// local one-time warning flag so we don't spam the console
let warnedOnce = false;

/**
 * Ensure ChaosSpec hooks are installed.
 * - If called at file/describe scope: register beforeAll/afterEach/afterAll hooks.
 * - If called from inside a test (currentTestName is set): DON'T register hooks (Jest forbids it);
 *   instead, start Toxiproxy immediately so the call can proceed, and warn once.
 */
export async function ensureChaosHooks(): Promise<"hooks" | "inline"> {
  const isJest =
    typeof expect !== "undefined" &&
    typeof (expect as any).getState === "function";
  if (!isJest) return "inline"; // running outside Jest: just inline-start when needed

  const state = (expect as any).getState?.() ?? {};
  const insideTest = Boolean(state.currentTestName);
  const testPath: string = state.testPath ?? "(unknown)";
  const CHAOS_REGEX = /\.chaos\.test\.[tj]sx?$/;

  // If we already armed hooks once, nothing else to do.
  if (runtimeState.hooksArmed) {
    return insideTest ? "inline" : "hooks";
  }

  if (insideTest) {
    // Can't add hooks here. Start Toxiproxy now so network is ready and proceed.
//     if (!warnedOnce) {
//       warnedOnce = true;
//       // eslint-disable-next-line no-console
//       console.warn(
//         `[ChaosSpec] Running in inline mode for ${testPath} (called inside a test).
// To enable automatic lifecycle hooks (recommended), add at the top of this file:
//   import "@chaosspec/autowire";
// or rename to: *.chaos.test.ts (autowire will attach automatically).`,
//       );
//     }
    runtimeState.hooksArmed = true; // mark so we don't repeat this branch
    await toxiproxyManager.start(); // ensure network exists right now
    return "inline";
  }

  // File/describe scope: safe to install hooks once
  runtimeState.hooksArmed = true;

  beforeAll(async () => {
    await toxiproxyManager.start();
  });

  afterEach(async () => {
    await cleanupAfterEachTest();
    await toxiproxyManager.reset();
  });

  afterAll(async () => {
    await cleanupAfterSuite();
    await toxiproxyManager.stop();
  });

  return "hooks";
}

export async function createService(
  name: string,
  opts: ServiceOpts,
): Promise<ServiceHandle> {
  // Soft guard: auto-install hooks or inline-start when needed; no hard error
  await ensureChaosHooks();

  const scope: Scope = opts.scope ?? "test";

  const container = await new GenericContainer(opts.image)
    .withEnvironment(opts.environment ?? {})
    .withExposedPorts(...(opts.ports ?? []))
    .withNetwork(toxiproxyManager.getNetwork())
    .withNetworkAliases(opts.alias ?? name)
    .start();

  // container cleanup bound to test or suite scope
  registerCleanup(async () => {
    try {
      await container.stop();
    } catch {
      /* best-effort */
    }
  }, scope);

  const handle: ServiceHandle = {
    name,
    container,
    url: (p?: number) => {
      const port = p ?? opts.ports?.[0] ?? 80;
      return `http://${container.getHost()}:${container.getMappedPort(port)}`;
    },
  };

  // Memoize proxies per upstream port
  if (opts.proxy) {
    const proxyCache = new Map<number, string>();

    handle.proxyAddr = async (upstreamPort?: number, listenPort?: number) => {
      const up = upstreamPort ?? opts.ports?.[0] ?? 80;
      if (proxyCache.has(up)) return proxyCache.get(up)!;

      const listen = listenPort ?? 10000 + Math.floor(Math.random() * 20000);
      const proxy = await toxiproxyManager.makeProxy(
        `${name}-proxy-${up}`,
        opts.alias ?? name, // upstreamHost by network alias
        up,
        listen,
      );

      const addr = `${toxiproxyManager.alias}:${proxy.listenPort}`;
      proxyCache.set(up, addr);
      return addr;
    };
  }

  return handle;
}
