import { createServer } from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { validateJwtSecret } from "./lib/jwt.js";
import { initSocket, startDeviceHeartbeat } from "./lib/socket.js";
import { loadScheduledTasks } from "./lib/scheduler.js";

validateJwtSecret();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

initSocket(httpServer);

httpServer.listen(port, async () => {
  logger.info({ port }, "MDM Server listening");

  startDeviceHeartbeat(60000);

  try {
    await loadScheduledTasks();
  } catch (err) {
    logger.error({ err }, "Error loading scheduled tasks (DB may not be ready yet)");
  }
});
