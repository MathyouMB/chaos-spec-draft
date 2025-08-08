import { toxiproxyManager } from "./toxiproxyManager";

/**
 * Add a latency toxic to an existing Toxiproxy proxy by name.
 * @param proxyName The proxy name you created (e.g., "redis-proxy-6379")
 * @param latencyMs Latency in milliseconds
 * @param jitter Optional jitter in ms (default 0)
 * @param stream "downstream" (client->service) or "upstream" (service->client)
 */
export async function injectLatency(
  proxyName: string,
  latencyMs: number,
  jitter = 0,
  stream: "downstream" | "upstream" = "downstream",
): Promise<void> {
  const client = toxiproxyManager.getClient();
  const all = await client.getAll();
  const proxy = all[proxyName];

  if (!proxy) {
    const available = Object.keys(all);
    throw new Error(
      `[ChaosSpec] Proxy "${proxyName}" not found. ` +
        (available.length
          ? `Available: ${available.join(", ")}`
          : "No proxies exist yet."),
    );
  }

  await proxy.addToxic({
    name: `latency-${Date.now()}`,
    type: "latency",
    stream,
    toxicity: 1.0,
    attributes: { latency: latencyMs, jitter },
  });
}

/**
 * Remove all toxics from a proxy (by recreating it with the same name/listen/upstream).
 * Useful for returning the connection to normal mid-test.
 */
export async function removeAllToxics(proxyName: string): Promise<void> {
  const client = toxiproxyManager.getClient();
  const all = await client.getAll();
  const proxy = all[proxyName];
  if (!proxy) return;

  const { listen, upstream } = proxy;
  await proxy.remove();
  await client.createProxy({ name: proxyName, listen, upstream });
}
