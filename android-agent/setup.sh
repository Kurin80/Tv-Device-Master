#!/bin/bash
# Downloads the Gradle wrapper jar needed to build the project.
# Run this once before using ./gradlew for the first time.
set -e
WRAPPER_DIR="$(dirname "$0")/gradle/wrapper"
JAR_URL="https://github.com/gradle/gradle/raw/v8.6.0/gradle/wrapper/gradle-wrapper.jar"
mkdir -p "$WRAPPER_DIR"
echo "Downloading gradle-wrapper.jar..."
curl -fSL "$JAR_URL" -o "$WRAPPER_DIR/gradle-wrapper.jar"
chmod +x "$(dirname "$0")/gradlew"
echo "Done. You can now run: ./gradlew assembleDebug"
