package com.mdm.androidagent

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.TextView

/**
 * Full-screen lock-task activity for kiosk mode.
 *
 * Lifecycle:
 *   1. CommandExecutor calls startActivity(KioskActivity, package=X)
 *   2. KioskActivity calls startLockTask() — device is now in kiosk mode
 *   3. KioskActivity launches the target app on top
 *   4. When kiosk_disable is received, stopLockTask() is called and this activity finishes
 */
class KioskActivity : Activity() {

    companion object {
        const val EXTRA_KIOSK_PACKAGE = "kiosk_package"
        private const val ACTION_STOP_KIOSK = "com.mdm.androidagent.ACTION_STOP_KIOSK"
        private const val TAG = "KioskActivity"

        // Static reference so CommandExecutor can trigger stop
        @Volatile
        private var instance: KioskActivity? = null

        fun requestStop() {
            instance?.stopKiosk()
        }
    }

    private var kioskPackage: String? = null
    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == ACTION_STOP_KIOSK) stopKiosk()
        }
    }

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk)

        instance = this
        kioskPackage = intent.getStringExtra(EXTRA_KIOSK_PACKAGE)

        // Full-screen immersive
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.hide(
                android.view.WindowInsets.Type.statusBars() or
                        android.view.WindowInsets.Type.navigationBars()
            )
        } else {
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Show package name in overlay
        findViewById<TextView>(R.id.kioskAppName)?.text = kioskPackage ?: ""

        // Register local broadcast receiver for kiosk stop
        val filter = IntentFilter(ACTION_STOP_KIOSK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stopReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(stopReceiver, filter)
        }

        // Start lock task
        try {
            startLockTask()
            Log.i(TAG, "startLockTask() called")
        } catch (e: Exception) {
            Log.e(TAG, "startLockTask failed", e)
        }

        // Launch the kiosk app on top
        kioskPackage?.let { pkg ->
            try {
                val launchIntent = packageManager.getLaunchIntentForPackage(pkg)
                    ?: Intent(Intent.ACTION_MAIN).apply { setPackage(pkg) }
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch kiosk app $pkg", e)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) instance = null
        try { unregisterReceiver(stopReceiver) } catch (_: Exception) {}
    }

    override fun onBackPressed() {
        // Consume back press — kiosk cannot be dismissed by user
    }

    fun stopKiosk() {
        try {
            stopLockTask()
            Log.i(TAG, "stopLockTask() called")
        } catch (e: Exception) {
            Log.e(TAG, "stopLockTask failed", e)
        }
        finish()
    }
}
