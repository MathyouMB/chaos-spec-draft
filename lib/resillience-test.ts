import { toxiproxyManager } from "./runtime/toxiproxyManager";
import { cleanupAfterEachTest, cleanupAfterSuite } from "./runtime/registry";
import { markHooksArmed } from "./runtime/runtimeState";

const isJest =
  typeof expect !== "undefined" &&
  typeof (expect as any).getState === "function";
if (isJest) {
  const testPath: string | undefined = (expect as any).getState()?.testPath;
  const CHAOS_REGEX = /\.chaos\.test\.[tj]sx?$/;

  if (testPath && CHAOS_REGEX.test(testPath)) {
    markHooksArmed(testPath);

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
  }
}
