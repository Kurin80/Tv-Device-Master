import { Router, type IRouter } from "express";
import { SIMULATION_MODE } from "../lib/adbService.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    adbMode: SIMULATION_MODE ? "simulation" : "real",
    version: process.env["npm_package_version"] ?? "0.1.0",
  });
});

export default router;
