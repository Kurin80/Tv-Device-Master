import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const ADB_TIMEOUT_MS = parseInt(process.env["ADB_TIMEOUT_MS"] ?? "10000");
const SIMULATION_MODE = process.env["ADB_SIMULATION"] === "true";

export interface AdbResult {
  success: boolean;
  output: string;
  error?: string;
}

function sanitizePackageName(pkg: string): string {
  return pkg.replace(/[^a-zA-Z0-9._]/g, "");
}

function sanitizeIp(ip: string): string {
  return ip.replace(/[^0-9.:\[\]]/g, "");
}

async function runAdb(args: string): Promise<AdbResult> {
  if (SIMULATION_MODE) {
    return simulateAdb(args);
  }

  try {
    const { stdout, stderr } = await execAsync(`adb ${args}`, {
      timeout: ADB_TIMEOUT_MS,
    });
    return { success: true, output: stdout || stderr };
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string; killed?: boolean };
    if (error.killed) {
      return { success: false, output: "", error: "Timeout: el dispositivo no respondió" };
    }
    const msg = error.message ?? "Error desconocido";
    if (msg.includes("Connection refused") || msg.includes("offline")) {
      return { success: false, output: "", error: "TV offline o conexión rechazada" };
    }
    return { success: false, output: "", error: msg };
  }
}

function simulateAdb(args: string): AdbResult {
  if (args.startsWith("connect")) {
    return { success: true, output: "connected to " + args.split(" ")[1] };
  }
  if (args.includes("pm list packages")) {
    return {
      success: true,
      output: [
        "package:com.google.android.youtube.tv",
        "package:com.netflix.ninja",
        "package:com.amazon.amazonvideo.livingroom",
        "package:com.disney.disneyplus",
        "package:com.spotify.tv.android",
        "package:com.android.settings",
        "package:com.android.launcher",
      ].join("\n"),
    };
  }
  if (args.includes("keyevent 26")) {
    return { success: true, output: "Screen toggled (simulation)" };
  }
  if (args.includes("keyevent 3")) {
    return { success: true, output: "Home pressed (simulation)" };
  }
  if (args.includes("monkey -p")) {
    return { success: true, output: "App launched (simulation)" };
  }
  if (args.includes("install")) {
    return { success: true, output: "Success (simulation)" };
  }
  if (args.includes("uninstall")) {
    return { success: true, output: "Success (simulation)" };
  }
  if (args.includes("shell reboot")) {
    return { success: true, output: "Rebooting (simulation)" };
  }
  return { success: true, output: "OK (simulation)" };
}

export async function connectDevice(ip: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  return runAdb(`connect ${safeIp}`);
}

export async function disconnectDevice(ip: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  return runAdb(`disconnect ${safeIp}`);
}

export async function toggleScreen(ip: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} shell input keyevent 26`);
}

export async function pressHome(ip: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} shell input keyevent 3`);
}

export async function pressBack(ip: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} shell input keyevent 4`);
}

export async function rebootDevice(ip: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} shell reboot`);
}

export async function openApp(ip: string, packageName: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  const safePkg = sanitizePackageName(packageName);
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} shell monkey -p ${safePkg} -c android.intent.category.LAUNCHER 1`);
}

export async function installApk(ip: string, apkPath: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  const safePath = apkPath.replace(/[^a-zA-Z0-9._\-/]/g, "");
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} install ${safePath}`);
}

export async function uninstallApp(ip: string, packageName: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  const safePkg = sanitizePackageName(packageName);
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} uninstall ${safePkg}`);
}

export async function listPackages(ip: string): Promise<string[]> {
  const safeIp = sanitizeIp(ip);
  await runAdb(`connect ${safeIp}`);
  const result = await runAdb(`-s ${safeIp} shell pm list packages`);
  if (!result.success) return [];
  return result.output
    .split("\n")
    .map((line) => line.trim().replace("package:", ""))
    .filter(Boolean);
}

export async function sendKeyEvent(ip: string, keycode: number): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} shell input keyevent ${keycode}`);
}

export async function enableKioskMode(ip: string, packageName: string): Promise<AdbResult> {
  const safeIp = sanitizeIp(ip);
  const safePkg = sanitizePackageName(packageName);
  await runAdb(`connect ${safeIp}`);
  return runAdb(`-s ${safeIp} shell settings put secure enabled_accessibility_services ${safePkg}`);
}

export async function checkConnection(ip: string): Promise<boolean> {
  const safeIp = sanitizeIp(ip);
  if (SIMULATION_MODE) return true;
  const result = await runAdb(`connect ${safeIp}`);
  return result.success && !result.output.includes("failed");
}

export { SIMULATION_MODE };
