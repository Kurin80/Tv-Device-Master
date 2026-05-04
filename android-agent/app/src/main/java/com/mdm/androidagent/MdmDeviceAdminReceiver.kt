package com.mdm.androidagent

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Device admin receiver — required to be eligible for Device Owner.
 *
 * To set this app as Device Owner (one-time, from a PC with ADB):
 *   adb shell dpm set-device-owner com.mdm.androidagent/.MdmDeviceAdminReceiver
 *
 * Device Owner mode unlocks: kiosk (startLockTask), screen lock, silent install/uninstall, reboot.
 */
class MdmDeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "MdmDeviceAdmin"
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.i(TAG, "Device admin disabled")
    }

    override fun onLockTaskModeEntering(context: Context, intent: Intent, pkg: String) {
        super.onLockTaskModeEntering(context, intent, pkg)
        Log.i(TAG, "Lock task mode entering: $pkg")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        super.onLockTaskModeExiting(context, intent)
        Log.i(TAG, "Lock task mode exiting")
    }
}
