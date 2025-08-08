import {
  GenericContainer,
  StartedTestContainer,
  Network,
  StartedNetwork,
} from "testcontainers";
import { Toxiproxy } from "toxiproxy-node-client";
import { registerCleanup } from "./registry";

type ProxyHandle = {
  name: string;
  listenHost: string; // for container-to-container: "toxiproxy"
  listenPort: number; // the port we asked toxiproxy to listen on
  delete: () => Promise<void>;
  addLatency: (latencyMs: number, jitter?: number) => Promise<void>;
  removeAllToxics: () => Promise<void>;
};

class ToxiproxyManager {
  private container?: StartedTestContainer;
  private client?: Toxiproxy;
  private network?: StartedNetwork;

  /** network alias other containers can use to reach toxiproxy */
  public alias = "toxiproxy";

  async start(): Promise<void> {
    if (this.client) return;

    // Create a user-defined network so containers can resolve each other by alias
    this.network = await new Network().start();

    // Start Toxiproxy and expose admin API so the test process can talk to it
    this.container = await new GenericContainer("shopify/toxiproxy")
      .withExposedPorts(8474)
      .withNetwork(this.network)
      .withNetworkAliases(this.alias)
      .start();

    const host = this.container.getHost();
    const adminPort = this.container.getMappedPort(8474);
    this.client = new Toxiproxy(`http://${host}:${adminPort}`);

    // Ensure toxiproxy container stops with the suite
    registerCleanup(async () => {
      await this.stop();
    }, "suite");
  }

  getNetwork(): StartedNetwork {
    if (!this.network) throw new Error("Toxiproxy network not started");
    return this.network;
  }

  getClient(): Toxiproxy {
    if (!this.client) throw new Error("Toxiproxy client not started");
    return this.client;
  }

  /**
   * Create a proxy listening on toxiproxy:<listenPort> forwarding to upstreamHost:upstreamPort.
   * Other containers (in the same network) should connect to `${alias}:${listenPort}`.
   */
  async makeProxy(
    name: string,
    upstreamHost: string,
    upstreamPort: number,
    listenPort: number,
  ): Promise<ProxyHandle> {
    if (!this.client) throw new Error("Toxiproxy client not started");

    // Bind inside the toxiproxy container; containers will reach it by alias
    let proxy = await this.client.createProxy({
      name,
      listen: `0.0.0.0:${listenPort}`,
      upstream: `${upstreamHost}:${upstreamPort}`,
    });

    // Preserve these so we can recreate the proxy (for removeAllToxics)
    const originalListen = proxy.listen; // e.g. "0.0.0.0:15001"
    const originalUpstream = proxy.upstream; // e.g. "redis:6379"

    // Cleanup hook (same semantics as 'test' bucket by default)
    registerCleanup(async () => {
      try {
        await proxy.remove();
      } catch {}
    });

    return {
      name,
      listenHost: this.alias,
      listenPort,
      delete: async () => {
        try {
          await proxy.remove();
        } catch {}
      },
      addLatency: async (latency, jitter = 0) => {
        await proxy.addToxic({
          name: `latency-${Date.now()}`,
          type: "latency",
          stream: "downstream",
          toxicity: 1.0,
          attributes: { latency, jitter },
        });
      },
      removeAllToxics: async () => {
        // The client lib has no "delete all toxics" helper,
        // so recreate the proxy with same name/listen/upstream.
        try {
          await proxy.remove();
        } catch {}
        proxy = await this.client!.createProxy({
          name,
          listen: originalListen,
          upstream: originalUpstream,
        });
      },
    };
  }

  async reset(): Promise<void> {
    if (!this.client) return;
    // Fast path: the client provides reset() to delete ALL proxies
    await this.client.reset();
  }

  async stop(): Promise<void> {
    await this.reset();
    if (this.container) await this.container.stop();
    if (this.network) await this.network.stop();
    this.container = undefined;
    this.client = undefined;
    this.network = undefined;
  }
}

export const toxiproxyManager = new ToxiproxyManager();
export type { ProxyHandle };
