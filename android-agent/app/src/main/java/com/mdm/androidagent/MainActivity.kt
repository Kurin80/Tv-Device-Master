package com.mdm.androidagent

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.mdm.androidagent.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Timer
import java.util.TimerTask

/**
 * Main activity — displayed when the device is already enrolled.
 * Shows agent status, last heartbeat, and command count.
 * Redirects to EnrollmentActivity if not yet enrolled.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var uptimeTimer: Timer? = null
    private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!MdmStorage.isEnrolled(this)) {
            startActivity(Intent(this, EnrollmentActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Start the polling service if not already running
        MdmPollingService.start(this)

        populateDeviceInfo()
        setupUnenrollButton()
        startUptimeRefresh()
    }

    override fun onDestroy() {
        super.onDestroy()
        uptimeTimer?.cancel()
    }

    private fun populateDeviceInfo() {
        val name = MdmStorage.getDeviceName(this) ?: "Desconocido"
        val url = MdmStorage.getServerUrl(this) ?: "—"
        val id = MdmStorage.getDeviceId(this)?.take(8)?.let { "$it…" } ?: "—"

        setRow(binding.rowDeviceName, "Dispositivo", name)
        setRow(binding.rowServerUrl, "Servidor", url)
        setRow(binding.rowDeviceId, "ID", id)

        setRow(binding.rowHeartbeat, "Último heartbeat", "Iniciando…")
        setRow(binding.rowCommands, "Comandos ejecutados", "0")
        setRow(binding.rowLastCommand, "Último comando", "—")
    }

    private fun setRow(rowView: android.view.View, label: String, value: String) {
        rowView.findViewById<TextView>(R.id.rowLabel)?.text = label
        rowView.findViewById<TextView>(R.id.rowValue)?.text = value
    }

    private fun setupUnenrollButton() {
        binding.btnUnenroll.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Desinscribir dispositivo")
                .setMessage(
                    "El dispositivo dejará de ser gestionado por MDM.\n\n" +
                    "¿Confirmar?"
                )
                .setPositiveButton("Desinscribir") { _, _ -> unenroll() }
                .setNegativeButton("Cancelar", null)
                .show()
        }
    }

    private fun unenroll() {
        MdmPollingService.stop(this)
        MdmStorage.clear(this)
        startActivity(Intent(this, EnrollmentActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        })
        finish()
    }

    private fun startUptimeRefresh() {
        // Update "last heartbeat" timestamp every 5 s from the shared service
        // (simple approximation — real implementation would use a BroadcastReceiver
        //  or LiveData from the service)
        uptimeTimer = Timer()
        uptimeTimer?.schedule(object : TimerTask() {
            override fun run() {
                runOnUiThread {
                    val now = timeFmt.format(Date())
                    setRow(binding.rowHeartbeat, "Último heartbeat", now)
                }
            }
        }, 0, 30_000)
    }
}
