import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import tenantsRouter from "./tenants.js";
import devicesRouter from "./devices.js";
import enrollmentRouter from "./enrollment.js";
import commandsRouter from "./commands.js";
import appsRouter from "./apps.js";
import logsRouter from "./logs.js";
import usersRouter from "./users.js";
import scheduledTasksRouter from "./scheduled-tasks.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tenantsRouter);
router.use(devicesRouter);
router.use(enrollmentRouter);
router.use(commandsRouter);
router.use(appsRouter);
router.use(logsRouter);
router.use(usersRouter);
router.use(scheduledTasksRouter);

export default router;
