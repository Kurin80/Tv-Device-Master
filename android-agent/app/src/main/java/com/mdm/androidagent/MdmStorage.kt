package com.mdm.androidagent

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persistent storage for device enrollment state.
 *
 * Uses EncryptedSharedPreferences on API 23+ (Marshmallow) to protect the
 * device token at rest. Falls back to plain SharedPreferences on API 21-22
 * where the Jetpack Security library is unavailable.
 *
 * NOTE: The device token is a secret — treat it like a password.
 */
object MdmStorage {

    private const val PLAIN_PREFS_NAME = "mdm_agent_prefs"
    private const val ENCRYPTED_PREFS_NAME = "mdm_agent_secure_prefs"

    private const val KEY_DEVICE_TOKEN = "device_token"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_DEVICE_NAME = "device_name"

    private fun prefs(context: Context): SharedPreferences {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context,
                    ENCRYPTED_PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (_: Exception) {
                // Fallback: key store unavailable (emulator or restricted device)
                context.getSharedPreferences(PLAIN_PREFS_NAME, Context.MODE_PRIVATE)
            }
        } else {
            // API 21-22: Jetpack Security not available
            context.getSharedPreferences(PLAIN_PREFS_NAME, Context.MODE_PRIVATE)
        }
    }

    fun isEnrolled(context: Context): Boolean = getDeviceToken(context) != null

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
