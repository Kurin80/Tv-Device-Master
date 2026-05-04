package com.mdm.androidagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Restarts the MDM polling service after the device boots or after the app is updated.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "MdmBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED) return

        if (!MdmStorage.isEnrolled(context)) {
            Log.d(TAG, "Device not enrolled — skipping service start")
            return
        }

        Log.i(TAG, "Starting MDM polling service after boot/update")
        val serviceIntent = Intent(context, MdmPollingService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
