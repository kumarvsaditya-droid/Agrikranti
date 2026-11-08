set -x
echo "JAVA_HOME=$JAVA_HOME ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT ANDROID_HOME=$ANDROID_HOME"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"; export PATH="$SDK/cmdline-tools/latest/bin:$(ls -d $SDK/cmdline-tools/*/bin | tail -1):$PATH"
npm i -g @bubblewrap/cli || exit 1
bubblewrap --version
mkdir -p ~/.bubblewrap
echo "{\"jdkPath\":\"$JAVA_HOME\",\"androidSdkPath\":\"$SDK\"}" > ~/.bubblewrap/config.json
cat ~/.bubblewrap/config.json
yes | sdkmanager --licenses > /dev/null 2>&1 || true
sdkmanager "build-tools;34.0.0" "platforms;android-34" > /dev/null 2>&1 || true
mkdir -p work && cp android/twa-manifest.json work/ && cd work || exit 1
keytool -genkeypair -keystore android.keystore -alias android -keyalg RSA -keysize 2048 -validity 10000 -storepass testpass123 -keypass testpass123 -dname "CN=Test" || exit 1
yes "" | timeout 600 bubblewrap update --skipVersionUpgrade --manifest=./twa-manifest.json
ls -la
[ -f gradlew ] || { echo "NO GRADLE PROJECT"; exit 1; }
chmod +x gradlew
./gradlew bundleRelease assembleRelease --no-daemon --stacktrace || exit 1
BT=$(ls -d $SDK/build-tools/* | sort -V | tail -1)
$BT/zipalign -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk aligned.apk
$BT/apksigner sign --ks android.keystore --ks-pass pass:testpass123 --out ../Agrikranti-test.apk aligned.apk
cp app/build/outputs/bundle/release/app-release.aab ../Agrikranti-unsigned.aab
ls -la ..
