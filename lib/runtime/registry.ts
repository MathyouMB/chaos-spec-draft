type Bucket = "test" | "suite";
const buckets: Record<Bucket, Array<() => Promise<void>>> = {
  test: [],
  suite: [],
};

export function registerCleanup(
  fn: () => Promise<void>,
  bucket: Bucket = "test",
) {
  buckets[bucket].push(fn);
}

export async function cleanup(bucket: Bucket) {
  const fns = buckets[bucket].splice(0, buckets[bucket].length);
  await Promise.allSettled(fns.map((f) => f()));
}

export const cleanupAfterEachTest = () => cleanup("test");
export const cleanupAfterSuite = () => cleanup("suite");
