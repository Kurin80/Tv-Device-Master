package com.mdm.androidagent

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Foreground service that keeps the MDM agent alive.
 *
 * Two independent coroutine loops:
 *   - Heartbeat: POST /api/agent/heartbeat every 30 s
 *   - Commands:  GET /api/agent/commands every 10 s, execute, POST result
 */
class MdmPollingService : LifecycleService() {

    companion object {
        private const val TAG = "MdmPollingService"
        private const val HEARTBEAT_INTERVAL_MS = 30_000L
        private const val POLL_INTERVAL_MS = 10_000L

        fun start(context: Context) {
            val intent = Intent(context, MdmPollingService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, MdmPollingService::class.java))
        }
    }

    private val json = "application/json; charset=utf-8".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private lateinit var executor: CommandExecutor
    private lateinit var serverUrl: String
    private lateinit var deviceToken: String

    override fun onCreate() {
        super.onCreate()
        startForeground(MdmApplication.NOTIFICATION_ID, buildNotification())
        executor = CommandExecutor(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        val token = MdmStorage.getDeviceToken(applicationContext)
        val url = MdmStorage.getServerUrl(applicationContext)

        if (token == null || url == null) {
            Log.w(TAG, "Not enrolled — stopping service")
            stopSelf()
            return START_NOT_STICKY
        }

        deviceToken = token
        serverUrl = url

        // Only start loops if not already running
        lifecycleScope.launch { heartbeatLoop() }
        lifecycleScope.launch { commandLoop() }

        return START_STICKY
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Heartbeat loop
    // ──────────────────────────────────────────────────────────────────────────

    private suspend fun heartbeatLoop() {
        while (true) {
            try {
                sendHeartbeat()
            } catch (e: Exception) {
                Log.w(TAG, "Heartbeat failed: ${e.message}")
            }
            delay(HEARTBEAT_INTERVAL_MS)
        }
    }

    private fun sendHeartbeat() {
        val ip = getLocalIpAddress()
        val body = JSONObject().apply {
            if (ip != null) put("ip", ip)
        }
        val request = Request.Builder()
            .url("$serverUrl/api/agent/heartbeat")
            .addHeader("X-Device-Token", deviceToken)
            .post(body.toString().toRequestBody(json))
            .build()
        http.newCall(request).execute().use { response ->
            Log.d(TAG, "Heartbeat: ${response.code}")
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Command poll loop
    // ──────────────────────────────────────────────────────────────────────────

    private suspend fun commandLoop() {
        while (true) {
            try {
                pollAndExecute()
            } catch (e: Exception) {
                Log.w(TAG, "Command poll failed: ${e.message}")
            }
            delay(POLL_INTERVAL_MS)
        }
    }

    private suspend fun pollAndExecute() {
        val request = Request.Builder()
            .url("$serverUrl/api/agent/commands")
            .addHeader("X-Device-Token", deviceToken)
            .get()
            .build()

        val responseBody = http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return
            response.body?.string() ?: return
        }

        val commands = JSONArray(responseBody)
        for (i in 0 until commands.length()) {
            val cmd = commands.getJSONObject(i)
            val id = cmd.getString("id")
            val command = cmd.getString("command")
            val param = if (cmd.has("param") && !cmd.isNull("param")) cmd.getString("param") else null

            Log.d(TAG, "Executing command: $command id=$id param=$param")
            val result = try {
                executor.execute(command, param)
            } catch (e: Exception) {
                CommandResult("error", e.message ?: "Error inesperado")
            }

            reportResult(id, result)
        }
    }

    private fun reportResult(commandId: String, result: CommandResult) {
        try {
            val body = JSONObject().apply {
                put("status", result.status)
                put("response", result.response)
                result.packages?.let { pkgs ->
                    put("packages", JSONArray(pkgs))
                }
            }
            val request = Request.Builder()
                .url("$serverUrl/api/agent/commands/$commandId/result")
                .addHeader("X-Device-Token", deviceToken)
                .post(body.toString().toRequestBody(json))
                .build()
            http.newCall(request).execute().use { response ->
                Log.d(TAG, "Result reported for $commandId: ${response.code}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to report result for $commandId: ${e.message}")
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    @Suppress("DEPRECATION")
    private fun getLocalIpAddress(): String? {
        return try {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val ip = wm.connectionInfo?.ipAddress ?: return null
            if (ip == 0) return null
            String.format(
                "%d.%d.%d.%d",
                ip and 0xff,
                ip shr 8 and 0xff,
                ip shr 16 and 0xff,
                ip shr 24 and 0xff
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                PendingIntent.FLAG_IMMUTABLE else 0
        )
        return NotificationCompat.Builder(this, MdmApplication.NOTIFICATION_CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
