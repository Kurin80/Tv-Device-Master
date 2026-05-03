import cron from "node-cron";
import { db } from "@workspace/db";
import { scheduledTasksTable, devicesTable, commandsTable, logsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import * as adb from "./adbService.js";
import { logger } from "./logger.js";
import { getIo } from "./socket.js";

type ScheduledTask = typeof scheduledTasksTable.$inferSelect;

const activeTasks = new Map<string, cron.ScheduledTask>();

export function scheduleTask(task: ScheduledTask): void {
  if (!cron.validate(task.cronExpression)) {
    logger.warn({ taskId: task.id, cron: task.cronExpression }, "Expresión cron inválida");
    return;
  }

  const cronTask = cron.schedule(task.cronExpression, async () => {
    logger.info({ taskId: task.id, action: task.action }, "Ejecutando tarea programada");

    if (!task.deviceId) return;

    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, task.deviceId)).limit(1);
    if (!device) return;

    let result: adb.AdbResult;
    try {
      switch (task.action) {
        case "screen_toggle":
          result = await adb.toggleScreen(device.ip);
          break;
        case "home":
          result = await adb.pressHome(device.ip);
          break;
        case "open_app":
          result = task.actionParam ? await adb.openApp(device.ip, task.actionParam) : { success: false, output: "", error: "Sin parámetro" };
          break;
        case "reboot":
          result = await adb.rebootDevice(device.ip);
          break;
        default:
          result = { success: false, output: "", error: "Acción desconocida" };
      }
    } catch (err) {
      result = { success: false, output: "", error: String(err) };
    }

    await db.insert(commandsTable).values({
      deviceId: device.id,
      command: `[cron] ${task.action}`,
      status: result.success ? "success" : "error",
      response: result.output || result.error,
      completedAt: new Date(),
    });

    await db.insert(logsTable).values({
      deviceId: device.id,
      message: `Tarea programada "${task.name}": ${result.output || result.error}`,
      level: result.success ? "info" : "error",
    });

    const io = getIo();
    if (io) {
      io.to(`tenant:${device.tenantId}`).emit("device:log", {
        deviceId: device.id,
        message: `[Cron] ${task.name}: ${result.output || result.error}`,
        level: result.success ? "info" : "error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  activeTasks.set(task.id, cronTask);
}

export function cancelTask(taskId: string): void {
  const existing = activeTasks.get(taskId);
  if (existing) {
    existing.stop();
    activeTasks.delete(taskId);
  }
}

export async function loadScheduledTasks(): Promise<void> {
  const tasks = await db.select().from(scheduledTasksTable).where(eq(scheduledTasksTable.enabled, true));
  for (const task of tasks) {
    scheduleTask(task);
  }
  logger.info({ count: tasks.length }, "Tareas programadas cargadas");
}
