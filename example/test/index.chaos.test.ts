import "@chaosspec/setup";
import { createService } from "@chaosspec";

describe("when HTTP request is made", () => {
  it("will fetch from an nginx demo container", async () => {
    const testApi = await createService("echo", {
      image: "ealen/echo-server",
      ports: [80],
    });

    const response = await fetch(`${testApi.url(80)}/`);

    expect(response.status).toBe(200);
  });
});
