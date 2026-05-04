package com.mdm.androidagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * Handles APK download, silent install/uninstall (Device Owner), and fallback user-prompted flows.
 *
 * Silent paths (Device Owner):
 *   - installSilent(): PackageInstaller.Session, awaits actual STATUS_SUCCESS/FAILURE via broadcast
 *   - uninstallSilent(): PackageInstaller.uninstall(), awaits result via broadcast
 *
 * Non-Device-Owner fallback:
 *   - installWithIntent(): shows system install prompt (user must confirm)
 */
object ApkInstaller {

    private const val TAG = "ApkInstaller"
    private const val INSTALL_TIMEOUT_MS = 120_000L   // 2 min for large APKs
    private const val UNINSTALL_TIMEOUT_MS = 30_000L

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    // ──────────────────────────────────────────────────────────────────────────
    // Download
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Downloads an APK from [url] to the app's cache directory.
     * Must be called from a background coroutine (IO dispatcher).
     */
    suspend fun download(context: Context, url: String): File = withContext(Dispatchers.IO) {
        val apkDir = File(context.cacheDir, "apk").also { it.mkdirs() }
        val apkFile = File(apkDir, "download_${System.currentTimeMillis()}.apk")

        val request = Request.Builder().url(url).build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw Exception("Error descargando APK: HTTP ${response.code}")
        }

        response.body?.byteStream()?.use { input ->
            FileOutputStream(apkFile).use { output ->
                input.copyTo(output)
            }
        } ?: throw Exception("Respuesta vacía del servidor al descargar APK")

        Log.d(TAG, "APK descargado: ${apkFile.length()} bytes → ${apkFile.path}")
        apkFile
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Silent install — awaits actual PackageInstaller result
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Installs [apkFile] silently via PackageInstaller.
     *
     * Registers a temporary BroadcastReceiver scoped to this install session so the
     * caller blocks until the system delivers [PackageInstaller.STATUS_SUCCESS] or an
     * error status — rather than falsely reporting success at commit time.
     *
     * Must be called from a background coroutine (IO dispatcher).
     */
    suspend fun installSilent(context: Context, apkFile: File): CommandResult =
        withContext(Dispatchers.IO) {
            val deferred = CompletableDeferred<CommandResult>()
            val packageInstaller = context.packageManager.packageInstaller

            val params = PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL
            )
            val sessionId = packageInstaller.createSession(params)

            // Register receiver BEFORE committing so we don't miss the broadcast
            val action = "com.mdm.androidagent.INSTALL_RESULT_$sessionId"
            val receiver = installResultReceiver(action, deferred) { context.unregisterReceiver(it) }
            registerReceiverSafe(context, receiver, action)

            try {
                val session = packageInstaller.openSession(sessionId)
                session.use { s ->
                    apkFile.inputStream().use { apkStream ->
                        s.openWrite("package", 0, apkFile.length()).use { out ->
                            apkStream.copyTo(out)
                            s.fsync(out)
                        }
                    }
                    val flags = pendingIntentFlags()
                    val pi = android.app.PendingIntent.getBroadcast(
                        context, sessionId,
                        Intent(action).setPackage(context.packageName),
                        flags
                    )
                    s.commit(pi.intentSender)
                }
            } catch (e: Exception) {
                try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
                apkFile.delete()
                return@withContext CommandResult(
                    "error",
                    "Error al iniciar sesión de instalación: ${e.message}"
                )
            }

            val result = withTimeoutOrNull(INSTALL_TIMEOUT_MS) { deferred.await() }
                ?: run {
                    try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
                    CommandResult(
                        "error",
                        "Timeout esperando resultado de instalación (${INSTALL_TIMEOUT_MS / 1000}s)"
                    )
                }
            apkFile.delete()
            result
        }

    // ──────────────────────────────────────────────────────────────────────────
    // Silent uninstall — awaits actual PackageInstaller result
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Uninstalls [packageName] silently via PackageInstaller.
     * Blocks until the system delivers the actual install/fail status.
     */
    suspend fun uninstallSilent(context: Context, packageName: String): CommandResult =
        withContext(Dispatchers.IO) {
            val deferred = CompletableDeferred<CommandResult>()
            val packageInstaller = context.packageManager.packageInstaller

            val requestCode = packageName.hashCode()
            val action = "com.mdm.androidagent.UNINSTALL_RESULT_${packageName.hashCode()}"
            val receiver = uninstallResultReceiver(packageName, action, deferred) { context.unregisterReceiver(it) }
            registerReceiverSafe(context, receiver, action)

            try {
                val flags = pendingIntentFlags()
                val pi = android.app.PendingIntent.getBroadcast(
                    context, requestCode,
                    Intent(action).setPackage(context.packageName),
                    flags
                )
                packageInstaller.uninstall(packageName, pi.intentSender)
            } catch (e: Exception) {
                try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
                deferred.complete(CommandResult("error", "Error al iniciar desinstalación: ${e.message}"))
            }

            withTimeoutOrNull(UNINSTALL_TIMEOUT_MS) { deferred.await() }
                ?: run {
                    try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
                    CommandResult("error", "Timeout esperando resultado de desinstalación (${UNINSTALL_TIMEOUT_MS / 1000}s)")
                }
        }

    // ──────────────────────────────────────────────────────────────────────────
    // Fallback — user-visible prompt
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Shows the system install dialog. Requires a UI context (Activity). Not silent.
     */
    fun installWithIntent(context: Context, apkFile: File) {
        val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        } else {
            @Suppress("DEPRECATION")
            Uri.fromFile(apkFile)
        }
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private fun installResultReceiver(
        action: String,
        deferred: CompletableDeferred<CommandResult>,
        unregister: (BroadcastReceiver) -> Unit
    ): BroadcastReceiver {
        return object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != action) return
                try { unregister(this) } catch (_: Exception) {}
                val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, Int.MIN_VALUE)
                if (status == PackageInstaller.STATUS_SUCCESS) {
                    deferred.complete(CommandResult("success", "APK instalado correctamente"))
                } else {
                    val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                        ?: "Código de error: $status"
                    deferred.complete(CommandResult("error", "Instalación fallida: $msg"))
                }
            }
        }
    }

    private fun uninstallResultReceiver(
        packageName: String,
        action: String,
        deferred: CompletableDeferred<CommandResult>,
        unregister: (BroadcastReceiver) -> Unit
    ): BroadcastReceiver {
        return object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != action) return
                try { unregister(this) } catch (_: Exception) {}
                val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, Int.MIN_VALUE)
                if (status == PackageInstaller.STATUS_SUCCESS) {
                    deferred.complete(CommandResult("success", "$packageName desinstalado correctamente"))
                } else {
                    val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                        ?: "Código de error: $status"
                    deferred.complete(CommandResult("error", "Desinstalación fallida: $msg"))
                }
            }
        }
    }

    private fun registerReceiverSafe(context: Context, receiver: BroadcastReceiver, action: String) {
        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
    }

    private fun pendingIntentFlags(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            android.app.PendingIntent.FLAG_MUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            android.app.PendingIntent.FLAG_UPDATE_CURRENT
        }
    }
}
