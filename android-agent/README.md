# MDM Android Agent (Native Kotlin)

App nativa en Kotlin para Android TV que actúa como agente MDM con soporte completo de **modo kiosco** y control avanzado del dispositivo via **Device Owner**.

---

## Arquitectura

```
Dashboard MDM ──► Servidor (API) ◄── TV Agent (polling HTTPS cada 10s)
                         │
                   POST heartbeat (30s)
                   GET  commands  (10s)
                   POST results
```

El agente **nunca requiere conexión entrante** — funciona desde cualquier red por Internet.

---

## Requisitos

- **Android Studio** Hedgehog (2023.1.1) o superior
- **JDK 17**
- **Android TV** con Android 5.0+ (API 21)
- ADB instalado en tu PC (solo para la instalación inicial y para establecer Device Owner)

---

## Compilar el APK

### Opción A — GitHub Actions (recomendado, sin instalación local)

Cada push a `main` dispara el workflow **Build Android Agent APK**
automáticamente. Para descargar el APK:

1. Abre la pestaña **Actions** del repositorio en GitHub.
2. Selecciona el workflow **Build Android Agent APK** en la barra lateral.
3. Abre la ejecución más reciente y descarga el artefacto
   `mdm-agent-debug-<sha>` o `mdm-agent-release-<sha>`.

También puedes lanzar el build manualmente desde la UI de GitHub
(**Actions → Build Android Agent APK → Run workflow**) sin necesidad de hacer
ningún push.

> Los releases automáticos (tag `vX.Y.Z-<sha>`) se crean en la sección
> **Releases** del repositorio con ambos APKs adjuntos cada vez que se fusiona
> un commit a `main`.

---

### Opción B — Compilación local

El repositorio incluye `gradle/wrapper/gradle-wrapper.jar` y `gradlew.bat`, así que **no hace falta** ejecutar `setup.sh` salvo que borres el JAR del wrapper.

**Requisito:** **JDK 17** (Android Gradle Plugin 8.x no funciona con Java 8). Si `JAVA_HOME` apunta a una carpeta que ya no existe, Gradle fallará hasta que lo corrijas o uses el script de Windows de abajo.

#### Linux / macOS

```bash
cd android-agent
chmod +x gradlew
./gradlew assembleDebug    # o assembleRelease
```

Si falta el wrapper JAR por algún motivo: `chmod +x setup.sh && ./setup.sh`

#### Windows (PowerShell)

```powershell
cd android-agent
.\build-apk.ps1              # assembleDebug por defecto
.\build-apk.ps1 assembleRelease
```

También puedes usar `.\gradlew.bat` directamente si `JAVA_HOME` apunta a un JDK 17 válido.

El APK queda en `app/build/outputs/apk/`.

---

## Instalar en la TV

### Paso 1 — Habilitar opciones de desarrollador

En la TV: **Ajustes → Acerca del dispositivo → Número de compilación** × 7

### Paso 2 — Habilitar ADB y fuentes desconocidas

```
Ajustes → Opciones de desarrollador:
  ✅ Depuración por USB/ADB
  ✅ Instalar apps de fuentes desconocidas
```

### Paso 3 — Conectar ADB por red

```bash
adb connect <IP-de-la-TV>:5555
adb devices   # debe listar la TV como "device"
```

### Paso 4 — Instalar el APK

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## Configurar Device Owner (una sola vez)

El Device Owner desbloquea el control total:

| Comando MDM     | Sin Device Owner | Con Device Owner |
|-----------------|:----------------:|:----------------:|
| `open_app`      | ✅               | ✅               |
| `home` / `back` | ✅               | ✅               |
| `screen_on`     | ✅               | ✅               |
| `list_apps`     | ✅               | ✅               |
| `kiosk_enable`  | ⚠️ parcial       | ✅ completo      |
| `kiosk_disable` | ⚠️ parcial       | ✅ completo      |
| `screen_off`    | ❌               | ✅               |
| `reboot`        | ❌               | ✅               |
| `install_apk`   | ⚠️ con prompt    | ✅ silencioso    |
| `uninstall_app` | ⚠️ con prompt    | ✅ silencioso    |

### Prerrequisitos para Device Owner

> **La TV no debe tener cuentas de Google añadidas** antes de ejecutar este comando.
> Si las tiene, elimínalas en **Ajustes → Cuentas**.

```bash
# Ejecutar desde tu PC con ADB conectado a la TV
adb shell dpm set-device-owner com.mdm.androidagent/.MdmDeviceAdminReceiver
```

Respuesta esperada:
```
Active admin set to component {com.mdm.androidagent/com.mdm.androidagent.MdmDeviceAdminReceiver}
```

---

## Inscripción del dispositivo

1. Abre **MDM Agent** en la TV (aparece en el launcher de Android TV)
2. Aparece el escáner QR con la cámara encendida
3. En el dashboard web MDM: **Dispositivos → Inscribir TV** → genera el QR
4. Apunta la cámara del TV (o una webcam USB) al QR
5. El agente se inscribe automáticamente y empieza a recibir comandos

---

## Modo Kiosco

El kiosco bloquea el TV en una sola app — el usuario no puede salir.

**Activar** desde el dashboard MDM:
```
Comando: kiosk_enable
Param:   com.example.mi_app   (package name de la app)
```

**Desactivar** desde el dashboard MDM:
```
Comando: kiosk_disable
```

Con Device Owner, `startLockTask()` bloquea el sistema UI por completo (no se puede salir con el mando, el botón home está deshabilitado).

Sin Device Owner, el kiosco es "soft" — el usuario puede intentar salir.

---

## Estructura del proyecto

```
android-agent/
├── app/
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/mdm/androidagent/
│       │   ├── MdmApplication.kt         — App class, crea el canal de notificación
│       │   ├── MainActivity.kt           — Pantalla de estado (si inscrito)
│       │   ├── EnrollmentActivity.kt     — Escáner QR + enroll
│       │   ├── KioskActivity.kt          — Pantalla de kiosco (startLockTask)
│       │   ├── MdmDeviceAdminReceiver.kt — Receptor de admin de dispositivo
│       │   ├── MdmPollingService.kt      — ForegroundService: heartbeat + poll
│       │   ├── BootReceiver.kt           — Arranca el servicio tras reinicio
│       │   ├── CommandExecutor.kt        — Ejecuta cada tipo de comando
│       │   ├── ApkInstaller.kt           — Descarga + instala/desinstala APKs
│       │   └── MdmStorage.kt             — SharedPreferences: deviceToken, serverUrl
│       └── res/
│           ├── xml/device_admin_policies.xml  — Políticas de administrador
│           └── xml/file_paths.xml             — FileProvider para APKs
├── setup.sh          — Descarga gradle-wrapper.jar (solo si falta el JAR del repo)
├── gradlew / gradlew.bat — Gradle wrapper
├── build-apk.ps1     — Windows: busca JDK 17 y ejecuta Gradle
└── README.md
```

---

## API del servidor consumida

El agente usa estos endpoints con el header `X-Device-Token: <uuid>`:

| Método | Endpoint | Frecuencia |
|--------|----------|-----------|
| `POST` | `/api/agent/heartbeat` | Cada 30 s |
| `GET`  | `/api/agent/commands` | Cada 10 s |
| `POST` | `/api/agent/commands/:id/result` | Tras ejecutar cada comando |

El `deviceToken` se obtiene del servidor al inscribirse (`POST /api/devices/enroll`).

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| "Device Owner" falla | La TV tiene cuentas Google | Eliminar cuentas y reintentar |
| QR no se escanea | La cámara no enfoca | Conectar webcam USB |
| El agente no aparece tras reinicio | `BOOT_COMPLETED` denegado | Verificar permisos en Ajustes de la TV |
| `kiosk_enable` sin bloqueo real | No es Device Owner | Ejecutar comando DPM de arriba |
| `install_apk` pide confirmación | No es Device Owner | Ejecutar comando DPM o confirmar manualmente |
| Gradle falla con “compatible with Java 8” / “Java 11” | JDK antiguo o `JAVA_HOME` incorrecto | Instalar JDK 17 y apuntar `JAVA_HOME`; en Windows usar `build-apk.ps1` |
| `install_apk` / descarga APK falla (HTTP o certificado propio) | Tráfico HTTP o CA interna no confiable | La app permite cleartext y CAs de usuario vía `network_security_config` |
