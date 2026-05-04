package com.mdm.androidagent

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.mdm.androidagent.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Main activity — displayed when the device is already enrolled.
 *
 * Shows real-time agent stats from MdmAgentStats (updated by MdmPollingService):
 *   - Last heartbeat timestamp
 *   - Commands executed count
 *   - Last command + its result status
 *
 * Polls MdmAgentStats every 5 s via a Handler — no service binding required.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val handler = Handler(Looper.getMainLooper())
    private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    private val refreshRunnable = object : Runnable {
        override fun run() {
            refreshStats()
            handler.postDelayed(this, 5_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!MdmStorage.isEnrolled(this)) {
            startActivity(Intent(this, EnrollmentActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        MdmPollingService.start(this)

        populateStaticInfo()
        setupUnenrollButton()
    }

    override fun onResume() {
        super.onResume()
        refreshStats()
        handler.postDelayed(refreshRunnable, 5_000L)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(refreshRunnable)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Static device info (changes only on re-enroll)
    // ──────────────────────────────────────────────────────────────────────────

    private fun populateStaticInfo() {
        val name = MdmStorage.getDeviceName(this) ?: "Desconocido"
        val url = MdmStorage.getServerUrl(this) ?: "—"
        val id = MdmStorage.getDeviceId(this)?.take(8)?.let { "$it…" } ?: "—"

        setRow(binding.rowDeviceName, "Dispositivo", name)
        setRow(binding.rowServerUrl, "Servidor", url)
        setRow(binding.rowDeviceId, "ID", id)

        // Initialize dynamic rows
        setRow(binding.rowHeartbeat, "Último heartbeat", "Iniciando servicio…")
        setRow(binding.rowCommands, "Comandos ejecutados", "0")
        setRow(binding.rowLastCommand, "Último comando", "—")
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Live stats from MdmAgentStats singleton (updated by the service)
    // ──────────────────────────────────────────────────────────────────────────

    private fun refreshStats() {
        val lastHbMs = MdmAgentStats.lastHeartbeatMs.get()
        val heartbeatText = if (lastHbMs == 0L) {
            "Esperando primer heartbeat…"
        } else {
            timeFmt.format(Date(lastHbMs))
        }
        setRow(binding.rowHeartbeat, "Último heartbeat", heartbeatText)

        val count = MdmAgentStats.commandsExecuted.get()
        setRow(binding.rowCommands, "Comandos ejecutados", count.toString())

        val lastCmd = MdmAgentStats.lastCommandDesc
        val lastStatus = MdmAgentStats.lastCommandStatus
        val lastCmdText = if (lastCmd == "—") "—" else "$lastCmd → $lastStatus"
        setRow(binding.rowLastCommand, "Último comando", lastCmdText)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Unenroll
    // ──────────────────────────────────────────────────────────────────────────

    private fun setupUnenrollButton() {
        binding.btnUnenroll.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Desinscribir dispositivo")
                .setMessage(
                    "El dispositivo dejará de ser gestionado por MDM.\n\n" +
                    "Para volver a inscribirlo tendrás que escanear un nuevo QR."
                )
                .setPositiveButton("Desinscribir") { _, _ -> unenroll() }
                .setNegativeButton("Cancelar", null)
                .show()
        }
    }

    private fun unenroll() {
        handler.removeCallbacks(refreshRunnable)
        MdmPollingService.stop(this)
        MdmStorage.clear(this)
        startActivity(Intent(this, EnrollmentActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        })
        finish()
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helper
    // ──────────────────────────────────────────────────────────────────────────

    private fun setRow(rowView: android.view.View, label: String, value: String) {
        rowView.findViewById<TextView>(R.id.rowLabel)?.text = label
        rowView.findViewById<TextView>(R.id.rowValue)?.text = value
    }
}
