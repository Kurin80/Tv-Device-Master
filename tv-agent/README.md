# MDM TV Agent

A lightweight Android TV companion app for QR-based device enrollment into the MDM system.

## How It Works

1. Admin opens the MDM Mobile app and navigates to the **Inscribir TV** (Enroll TV) tab — this generates an enrollment QR code valid for 15 minutes.
2. The Android TV runs this agent app, which opens a camera/QR scanner view on the TV screen.
3. The TV scans the QR code. The app automatically:
   - Parses `{ enrollUrl, token }` from the QR payload
   - Detects the TV's local IP address
   - POSTs `{ token, name, ip }` to the enrollment endpoint
4. The TV device appears instantly in the tenant dashboard.

## QR Payload Format

```json
{
  "enrollUrl": "https://<domain>/api/devices/enroll",
  "token": "<15-minute JWT>"
}
```

## Enrollment API

```
POST /api/devices/enroll
Content-Type: application/json

{
  "token": "<enrollment JWT>",
  "name": "<device name>",
  "ip": "<device IPv4 address>"
}
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [EAS CLI](https://docs.expo.dev/eas/): `npm install -g eas-cli`
- An Expo account: `eas login`
- Android TV device connected via ADB or accessible network

## Build & Install

### 1. Install dependencies

```bash
npm install
```

### 2. (Optional) Replace placeholder assets

The `assets/` folder ships with placeholder images so the project builds out of the box. To use your own branding, replace:
- `icon.png` — 1024×1024 app icon
- `splash.png` — 2048×2048 splash screen
- `adaptive-icon.png` — 1024×1024 Android adaptive icon foreground

### 3. Configure EAS project

```bash
eas init
```

### 4. Build an APK for Android TV

```bash
# Development / sideloading
eas build --platform android --profile preview

# Production
eas build --platform android --profile production
```

EAS will produce a `.apk` file you can download and sideload onto the TV.

### 5. Sideload onto Android TV

Enable **Developer Options** and **Unknown Sources** on the TV, then:

```bash
# Install via ADB
adb connect <tv-ip>:5555
adb install mdm-tv-agent.apk
```

Or use a file manager app on the TV to install the APK from a USB drive.

### 6. Grant Camera Permission

On first launch the app will request camera access. Use the TV remote to confirm. If the TV does not have a built-in camera, connect a USB webcam.

## Project Structure

```
tv-agent/
├── App.tsx          # Main app (scanner → enrolling → success/error)
├── app.json         # Expo config (Android TV, landscape, dark theme)
├── eas.json         # EAS build profiles
├── package.json
├── tsconfig.json
└── assets/          # App icons and splash (add your own images)
```

## Notes

- The app is set to **landscape** orientation — standard for Android TV.
- UI is designed for TV viewing distance: large text (22-36pt), high contrast dark theme.
- The QR scanning view shows a blue corner-bracket frame to guide alignment.
- After successful enrollment, a confirmation screen displays the device name, IP, and ID.
- The "Inscribir otro dispositivo" (Enroll another device) button resets to scanner mode.
- Token expiry is 15 minutes; refresh the QR in the mobile app if needed.
