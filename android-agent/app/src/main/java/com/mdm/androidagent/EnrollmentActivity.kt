package com.mdm.androidagent

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Camera-based QR enrollment screen.
 *
 * Scans a QR code containing { enrollUrl, token }, then:
 *   1. POSTs to enrollUrl with { token, name, ip }
 *   2. Receives { id, deviceToken, ... } from the server
 *   3. Persists state in MdmStorage
 *   4. Starts MdmPollingService
 *   5. Navigates to MainActivity
 */
class EnrollmentActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "EnrollmentActivity"
        private const val REQUEST_CAMERA = 100
    }

    private lateinit var cameraExecutor: ExecutorService
    private var scanned = false

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val json = "application/json; charset=utf-8".toMediaType()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_enrollment)
        cameraExecutor = Executors.newSingleThreadExecutor()

        if (hasCameraPermission()) {
            startCamera()
        } else {
            requestCameraPermission()
        }

        findViewById<Button>(R.id.btnRetry)?.setOnClickListener {
            scanned = false
            showScanning()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Camera setup
    // ──────────────────────────────────────────────────────────────────────────

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also { preview ->
                preview.setSurfaceProvider(
                    findViewById<PreviewView>(R.id.cameraPreview).surfaceProvider
                )
            }

            val barcodeScanner = BarcodeScanning.getClient()
            val analyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { analysis ->
                    analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                        processImage(imageProxy, barcodeScanner)
                    }
                }

            try {
                cameraProvider.unbindAll()
                val selector = chooseCameraSelector(cameraProvider)
                cameraProvider.bindToLifecycle(this, selector, preview, analyzer)
            } catch (e: Exception) {
                Log.e(TAG, "Camera bind failed", e)
                showError("No se pudo acceder a la cámara: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    /**
     * Picks the best available camera for QR scanning.
     *
     * Priority: back camera → front camera → any available camera.
     * This ensures enrollment works on Android TV boxes and devices
     * with USB webcams that don't expose a "back" camera lens.
     */
    private fun chooseCameraSelector(
        cameraProvider: ProcessCameraProvider
    ): CameraSelector {
        return when {
            cameraProvider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) ->
                CameraSelector.DEFAULT_BACK_CAMERA
            cameraProvider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) ->
                CameraSelector.DEFAULT_FRONT_CAMERA
            else -> {
                // Last resort: accept any camera reported by the system (USB webcams, etc.)
                val available = cameraProvider.availableCameraInfos
                if (available.isEmpty()) throw Exception("No hay ninguna cámara disponible en este dispositivo")
                Log.w(TAG, "No standard camera found; using first available of ${available.size}")
                // Build a selector that matches the first available camera by index
                CameraSelector.Builder()
                    .addCameraFilter { cameras -> cameras.take(1) }
                    .build()
            }
        }
    }

    @androidx.annotation.OptIn(ExperimentalGetImage::class)
    private fun processImage(
        imageProxy: ImageProxy,
        scanner: com.google.mlkit.vision.barcode.BarcodeScanner
    ) {
        if (scanned) {
            imageProxy.close()
            return
        }
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }
        val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        scanner.process(inputImage)
            .addOnSuccessListener { barcodes ->
                barcodes.firstOrNull()?.rawValue?.let { value ->
                    if (!scanned) {
                        scanned = true
                        handleQrCode(value)
                    }
                }
            }
            .addOnCompleteListener { imageProxy.close() }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Enrollment
    // ──────────────────────────────────────────────────────────────────────────

    private fun handleQrCode(data: String) {
        showEnrolling("Código escaneado — conectando con el servidor…")

        lifecycleScope.launch {
            try {
                val payload = try {
                    JSONObject(data)
                } catch (e: Exception) {
                    throw Exception("QR inválido. Escanea el código generado por el panel MDM.")
                }

                val enrollUrl = payload.optString("enrollUrl").takeIf { it.isNotBlank() }
                    ?: throw Exception("QR incompleto. Genera un nuevo código en el panel MDM.")
                val token = payload.optString("token").takeIf { it.isNotBlank() }
                    ?: throw Exception("Token ausente en el QR.")

                val ip = getLocalIpAddress()
                    ?: throw Exception("No se pudo obtener la IP. Verifica la conexión WiFi.")

                val deviceName = Build.MODEL ?: "Android TV"

                showEnrolling("Registrando '$deviceName' (IP: $ip)…")

                val requestBody = JSONObject().apply {
                    put("token", token)
                    put("name", deviceName)
                    put("ip", ip)
                }.toString()

                val response = withContext(Dispatchers.IO) {
                    val req = Request.Builder()
                        .url(enrollUrl)
                        .post(requestBody.toRequestBody(json))
                        .build()
                    http.newCall(req).execute()
                }

                val responseString = withContext(Dispatchers.IO) {
                    response.body?.string() ?: ""
                }

                if (!response.isSuccessful) {
                    val errMsg = try {
                        JSONObject(responseString).optString("error", "Error ${response.code}")
                    } catch (_: Exception) {
                        "Error ${response.code}"
                    }
                    throw Exception(errMsg)
                }

                val device = JSONObject(responseString)
                val deviceToken = device.optString("deviceToken").takeIf { it.isNotBlank() }
                    ?: throw Exception("El servidor no devolvió un token. Actualiza el servidor MDM.")
                val deviceId = device.getString("id")

                // Derive serverUrl preserving protocol, host and port (if non-standard)
                val url = URL(enrollUrl)
                val port = url.port
                val serverUrl = if (port == -1 || port == url.defaultPort) {
                    "${url.protocol}://${url.host}"
                } else {
                    "${url.protocol}://${url.host}:$port"
                }

                MdmStorage.save(this@EnrollmentActivity, deviceToken, deviceId, serverUrl, deviceName)

                Log.i(TAG, "Enrolled: deviceId=$deviceId serverUrl=$serverUrl")

                MdmPollingService.start(this@EnrollmentActivity)

                startActivity(Intent(this@EnrollmentActivity, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                })
                finish()

            } catch (e: Exception) {
                Log.e(TAG, "Enrollment error", e)
                showError(e.message ?: "Error desconocido")
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun getLocalIpAddress(): String? {
        return try {
            val wm = applicationContext.getSystemService(android.net.wifi.WifiManager::class.java)
            val ip = wm?.connectionInfo?.ipAddress ?: return null
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

    // ──────────────────────────────────────────────────────────────────────────
    // UI states
    // ──────────────────────────────────────────────────────────────────────────

    private fun showScanning() {
        runOnUiThread {
            findViewById<ProgressBar>(R.id.enrollProgress)?.visibility = View.GONE
            findViewById<TextView>(R.id.enrollStatus)?.visibility = View.GONE
            findViewById<TextView>(R.id.enrollError)?.visibility = View.GONE
            findViewById<Button>(R.id.btnRetry)?.visibility = View.GONE
        }
    }

    private fun showEnrolling(message: String) {
        runOnUiThread {
            findViewById<ProgressBar>(R.id.enrollProgress)?.visibility = View.VISIBLE
            val statusText = findViewById<TextView>(R.id.enrollStatus)
            statusText?.visibility = View.VISIBLE
            statusText?.text = message
            findViewById<TextView>(R.id.enrollError)?.visibility = View.GONE
            findViewById<Button>(R.id.btnRetry)?.visibility = View.GONE
        }
    }

    private fun showError(message: String) {
        runOnUiThread {
            scanned = false
            findViewById<ProgressBar>(R.id.enrollProgress)?.visibility = View.GONE
            findViewById<TextView>(R.id.enrollStatus)?.visibility = View.GONE
            val errorText = findViewById<TextView>(R.id.enrollError)
            errorText?.visibility = View.VISIBLE
            errorText?.text = message
            findViewById<Button>(R.id.btnRetry)?.visibility = View.VISIBLE
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Permissions
    // ──────────────────────────────────────────────────────────────────────────

    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED

    private fun requestCameraPermission() {
        requestPermissions(arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_CAMERA &&
            grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        } else {
            Toast.makeText(this, "Se requiere permiso de cámara para escanear el QR", Toast.LENGTH_LONG).show()
        }
    }
}
