package com.mdm.androidagent

import android.content.Context
import android.content.SharedPreferences

/**
 * Persistent storage for device enrollment state.
 * Uses regular SharedPreferences (data is already protected by Android's app sandbox).
 */
object MdmStorage {

    private const val PREFS_NAME = "mdm_agent_prefs"
    private const val KEY_DEVICE_TOKEN = "device_token"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_DEVICE_NAME = "device_name"

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun isEnrolled(context: Context): Boolean =
        getDeviceToken(context) != null

    fun save(
        context: Context,
        deviceToken: String,
        deviceId: String,
        serverUrl: String,
        deviceName: String
    ) {
        prefs(context).edit()
            .putString(KEY_DEVICE_TOKEN, deviceToken)
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_SERVER_URL, serverUrl)
            .putString(KEY_DEVICE_NAME, deviceName)
            .apply()
    }

    fun getDeviceToken(context: Context): String? =
        prefs(context).getString(KEY_DEVICE_TOKEN, null)

    fun getDeviceId(context: Context): String? =
        prefs(context).getString(KEY_DEVICE_ID, null)

    fun getServerUrl(context: Context): String? =
        prefs(context).getString(KEY_SERVER_URL, null)

    fun getDeviceName(context: Context): String? =
        prefs(context).getString(KEY_DEVICE_NAME, null)

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }
}
