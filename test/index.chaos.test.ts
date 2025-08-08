import { createService } from "@chaosspec";

describe("HTTP smoke", () => {
  it("can fetch from an nginx demo container", async () => {
    const testApi = await createService("echo", {
      image: "ealen/echo-server",
      ports: [80],
    });

    const response = await fetch(`${testApi.url(80)}/`);

    expect(response.status).toBe(200);
  });
});
