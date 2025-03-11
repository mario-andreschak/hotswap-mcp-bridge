/**
 * App tests
 */
import { createApp } from "../index.js";
import { LogLevel } from "../utils/logging.js";

describe("App", () => {
  let app: ReturnType<typeof createApp>;
  
  beforeEach(() => {
    app = createApp({
      port: 0, // Use a random port
      logLevel: LogLevel.ERROR // Minimize logging during tests
    });
  });
  
  afterEach(async () => {
    await app.stop();
  });
  
  it("should start and stop without errors", async () => {
    await expect(app.start()).resolves.not.toThrow();
    await expect(app.stop()).resolves.not.toThrow();
  });
});
