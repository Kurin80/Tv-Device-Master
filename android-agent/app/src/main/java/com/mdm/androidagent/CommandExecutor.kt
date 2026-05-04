package com.mdm.androidagent

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.PowerManager
import android.util.Log
import android.view.KeyEvent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

data class CommandResult(
    val status: String,         // "success" | "error"
    val response: String,
    val packages: List<String>? = null
)

/**
 * Executes MDM commands locally on the Android device.
 *
 * Commands that require Device Owner (set once via ADB):
 *   kiosk_enable, kiosk_disable, screen_off, reboot, silent install/uninstall
 *
 * Commands that work without Device Owner:
 *   open_app, home, back, screen_on, keyevent, list_apps
 */
class CommandExecutor(private val context: Context) {

    companion object {
        private const val TAG = "MdmCommandExecutor"
    }

    private val dpm: DevicePolicyManager =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private val adminComponent: ComponentName =
        ComponentName(context, MdmDeviceAdminReceiver::class.java)

    private val isDeviceOwner: Boolean
        get() = dpm.isDeviceOwnerApp(context.packageName)

    suspend fun execute(command: String, param: String?): CommandResult {
        Log.d(TAG, "Executing: $command param=$param deviceOwner=$isDeviceOwner")
        return when (command) {
            "kiosk_enable"         -> kioskEnable(param)
            "kiosk_disable"        -> kioskDisable()
            "screen_off"           -> screenOff()
            "screen_on",
            "screen_toggle"        -> screenOn()
            "reboot"               -> reboot()
            "list_apps",
            "sync_apps"            -> listApps()
            "install_apk"          -> installApk(param)
            "uninstall_app"        -> uninstallApp(param)
            "open_app"             -> openApp(param)
            "home"                 -> goHome()
            "back"                 -> sendKey(KeyEvent.KEYCODE_BACK)
            "keyevent"             -> keyevent(param)
            else                   -> CommandResult("error", "Comando '$command' no reconocido")
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Kiosk
    // ──────────────────────────────────────────────────────────────────────────

    private suspend fun kioskEnable(packageName: String?): CommandResult =
        withContext(Dispatchers.Main) {
            if (packageName.isNullOrBlank()) {
                return@withContext CommandResult("error", "package_name requerido para kiosk_enable")
            }
            try {
                if (isDeviceOwner) {
                    // Allow the kiosk package to enter lock-task mode
                    val allowed = arrayOf(context.packageName, packageName)
                    dpm.setLockTaskPackages(adminComponent, allowed)
                }
                // Start KioskActivity — it calls startLockTask() internally
                val intent = Intent(context, KioskActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    putExtra(KioskActivity.EXTRA_KIOSK_PACKAGE, packageName)
                }
                context.startActivity(intent)
                CommandResult("success", "Modo kiosco activado para $packageName")
            } catch (e: Exception) {
                Log.e(TAG, "kioskEnable error", e)
                CommandResult("error", e.message ?: "Error al activar kiosco")
            }
        }

    private fun kioskDisable(): CommandResult {
        return try {
            KioskActivity.requestStop()
            if (isDeviceOwner) {
                dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))
            }
            CommandResult("success", "Modo kiosco desactivado")
        } catch (e: Exception) {
            Log.e(TAG, "kioskDisable error", e)
            CommandResult("error", e.message ?: "Error al desactivar kiosco")
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Screen
    // ──────────────────────────────────────────────────────────────────────────

    private fun screenOff(): CommandResult {
        return if (isDeviceOwner) {
            try {
                dpm.lockNow()
                CommandResult("success", "Pantalla bloqueada")
            } catch (e: Exception) {
                CommandResult("error", e.message ?: "Error al bloquear pantalla")
            }
        } else {
            CommandResult("error", "screen_off requiere Device Owner (ver README para configuración)")
        }
    }

    @Suppress("DEPRECATION")
    private fun screenOn(): CommandResult {
        return try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                // API 27+: use wakeUp
                pm.wakeUp(android.os.SystemClock.uptimeMillis(),
                    PowerManager.WAKE_REASON_APPLICATION, TAG)
            } else {
                val wl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                            or PowerManager.ACQUIRE_CAUSES_WAKEUP
                            or PowerManager.ON_AFTER_RELEASE,
                    "$TAG:screenOn"
                )
                wl.acquire(3_000)
                wl.release()
            }
            CommandResult("success", "Pantalla encendida")
        } catch (e: Exception) {
            CommandResult("error", e.message ?: "Error al encender pantalla")
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Reboot
    // ──────────────────────────────────────────────────────────────────────────

    private fun reboot(): CommandResult {
        return if (!isDeviceOwner) {
            CommandResult("error", "reboot requiere Device Owner (ver README para configuración)")
        } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            CommandResult("error", "reboot requiere Android 7.0+")
        } else {
            try {
                dpm.reboot(adminComponent)
                CommandResult("success", "Reiniciando dispositivo")
            } catch (e: Exception) {
                CommandResult("error", e.message ?: "Error al reiniciar")
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // App management
    // ──────────────────────────────────────────────────────────────────────────

    private fun listApps(): CommandResult {
        return try {
            val packages = context.packageManager
                .getInstalledPackages(0)
                .filter { pi ->
                    val flags = pi.applicationInfo?.flags ?: 0
                    // Include user-installed apps only (exclude system apps)
                    (flags and ApplicationInfo.FLAG_SYSTEM) == 0
                }
                .map { it.packageName }
                .sorted()
            CommandResult("success", "${packages.size} apps instaladas", packages)
        } catch (e: Exception) {
            CommandResult("error", e.message ?: "Error al listar apps")
        }
    }

    private suspend fun installApk(url: String?): CommandResult {
        if (url.isNullOrBlank()) {
            return CommandResult("error", "URL de APK requerida")
        }
        return try {
            val apkFile = ApkInstaller.download(context, url)
            if (isDeviceOwner) {
                ApkInstaller.installSilent(context, apkFile)
            } else {
                withContext(Dispatchers.Main) {
                    ApkInstaller.installWithIntent(context, apkFile)
                }
            }
            CommandResult("success", "APK instalado desde $url")
        } catch (e: Exception) {
            Log.e(TAG, "installApk error", e)
            CommandResult("error", e.message ?: "Error al instalar APK")
        }
    }

    private suspend fun uninstallApp(packageName: String?): CommandResult {
        if (packageName.isNullOrBlank()) {
            return CommandResult("error", "package_name requerido")
        }
        return try {
            if (isDeviceOwner) {
                withContext(Dispatchers.IO) {
                    ApkInstaller.uninstallSilent(context, packageName)
                }
            } else {
                withContext(Dispatchers.Main) {
                    val intent = Intent(Intent.ACTION_DELETE).apply {
                        data = android.net.Uri.parse("package:$packageName")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }
            }
            CommandResult("success", "App $packageName desinstalada")
        } catch (e: Exception) {
            CommandResult("error", e.message ?: "Error al desinstalar $packageName")
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Navigation
    // ──────────────────────────────────────────────────────────────────────────

    private suspend fun openApp(packageName: String?): CommandResult {
        if (packageName.isNullOrBlank()) {
            return CommandResult("error", "package_name requerido")
        }
        return withContext(Dispatchers.Main) {
            try {
                val intent = context.packageManager.getLaunchIntentForPackage(packageName)
                    ?: Intent(Intent.ACTION_MAIN).apply {
                        setPackage(packageName)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                CommandResult("success", "App $packageName lanzada")
            } catch (e: Exception) {
                CommandResult("error", e.message ?: "App $packageName no encontrada")
            }
        }
    }

    private suspend fun goHome(): CommandResult = withContext(Dispatchers.Main) {
        try {
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            CommandResult("success", "Pantalla de inicio")
        } catch (e: Exception) {
            CommandResult("error", e.message ?: "Error al ir a inicio")
        }
    }

    private fun keyevent(param: String?): CommandResult {
        val keycode = param?.toIntOrNull()
            ?: return CommandResult("error", "keycode numérico requerido (ej. 3 para HOME)")
        return sendKey(keycode)
    }

    private fun sendKey(keycode: Int): CommandResult {
        return try {
            Thread {
                android.app.Instrumentation().sendKeyDownUpSync(keycode)
            }.start()
            CommandResult("success", "Keyevent $keycode enviado")
        } catch (e: Exception) {
            CommandResult("error", e.message ?: "Error al enviar keyevent $keycode")
        }
    }
}
