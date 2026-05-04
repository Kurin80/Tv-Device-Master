package com.mdm.androidagent

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * Handles APK download, silent install (Device Owner), and fallback user-prompted install.
 */
object ApkInstaller {

    private const val TAG = "ApkInstaller"
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    /**
     * Downloads an APK from the given URL to the app's cache directory.
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
        } ?: throw Exception("Respuesta vacía del servidor")

        Log.d(TAG, "APK descargado: ${apkFile.length()} bytes → ${apkFile.path}")
        apkFile
    }

    /**
     * Silent install via PackageInstaller API — works without user interaction when Device Owner.
     */
    suspend fun installSilent(context: Context, apkFile: File) = withContext(Dispatchers.IO) {
        val packageInstaller = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)

        val sessionId = packageInstaller.createSession(params)
        val session = packageInstaller.openSession(sessionId)

        session.use { s ->
            apkFile.inputStream().use { apkStream ->
                s.openWrite("package", 0, apkFile.length()).use { sessionStream ->
                    apkStream.copyTo(sessionStream)
                    s.fsync(sessionStream)
                }
            }
            // Create a broadcast PendingIntent for install result
            val intent = Intent("com.mdm.androidagent.INSTALL_RESULT")
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                android.app.PendingIntent.FLAG_MUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
            } else {
                android.app.PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pendingIntent = android.app.PendingIntent.getBroadcast(context, sessionId, intent, flags)
            s.commit(pendingIntent.intentSender)
        }

        Log.d(TAG, "Silent install committed for session $sessionId")
        apkFile.delete()
    }

    /**
     * Fallback install — shows the system install prompt to the user.
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

    /**
     * Silent uninstall via PackageInstaller — works without user interaction when Device Owner.
     */
    fun uninstallSilent(context: Context, packageName: String) {
        val packageInstaller = context.packageManager.packageInstaller
        val intent = Intent("com.mdm.androidagent.UNINSTALL_RESULT")
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            android.app.PendingIntent.FLAG_MUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            android.app.PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = android.app.PendingIntent.getBroadcast(context, 0, intent, flags)
        packageInstaller.uninstall(packageName, pendingIntent.intentSender)
        Log.d(TAG, "Silent uninstall initiated for $packageName")
    }
}
