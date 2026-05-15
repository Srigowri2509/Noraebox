import { Capacitor } from "@capacitor/core";
import { getConfig } from "../config";

function getApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const config = getConfig();
  return config.api_url || "http://192.168.1.16:8000";
}

const getAPIBase = () => getApiBase();
const APP_NAME = "tablet-app";

const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || "Srigowri2509/Noraebox";
const GITHUB_API_BASE = "https://api.github.com/repos";

/** @returns {number} negative if a<b, 0 equal, positive if a>b */
function compareSemver(a, b) {
  const pa = String(a)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

const getPlatform = () => {
  if (typeof window === "undefined") return "web";
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform();
  }
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return "ios";
  if (/android/.test(userAgent)) return "android";
  return "web";
};

const PLATFORM = getPlatform();

function getS3ManifestUrl() {
  const fromEnv = import.meta.env.VITE_S3_TABLET_UPDATE_MANIFEST_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim();
  }
  try {
    const cfg = getConfig();
    const u = cfg.s3_update_manifest_url;
    if (typeof u === "string" && u.trim()) return u.trim();
  } catch {
    /* ignore */
  }
  return "";
}

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

class UpdateService {
  constructor() {
    this.checkInterval = null;
    this.scheduledCheckTime = null;
    this.isChecking = false;
    this.capacitorAvailable = false;
    this.App = null;
    this._capReady = this.initCapacitor();
  }

  async initCapacitor() {
    try {
      const { App } = await import("@capacitor/app");
      this.App = App;
      this.capacitorAvailable = true;
    } catch {
      this.capacitorAvailable = false;
      console.log("Running in web mode - Capacitor not available");
    }
  }

  async ensureReady() {
    await this._capReady;
  }

  async getCurrentVersion() {
    await this.ensureReady();
    try {
      if (this.capacitorAvailable && this.App) {
        const info = await this.App.getInfo();
        return info.version || "0.0.0";
      }
      return localStorage.getItem("app_version") || "0.0.0";
    } catch (error) {
      console.error("Error getting app version:", error);
      return localStorage.getItem("app_version") || "0.0.0";
    }
  }

  setVersion(version) {
    localStorage.setItem("app_version", version);
  }

  /**
   * Fetch a public JSON manifest from S3 (or any HTTPS URL).
   * Expected shape: { version, apk_url | download_url, release_notes?, force_update?, file_size? }
   */
  async checkS3Manifest(currentVersion) {
    const manifestUrl = getS3ManifestUrl();
    if (!manifestUrl) {
      return null;
    }

    const response = await fetch(manifestUrl, {
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.warn("S3 update manifest fetch failed:", response.status);
      return null;
    }

    const manifest = await response.json();
    const latestVersion = manifest.version || manifest.latest_version;
    if (!latestVersion) {
      console.warn("S3 manifest missing version");
      return null;
    }

    const apkUrl = manifest.apk_url || manifest.download_url;
    if (!apkUrl || typeof apkUrl !== "string") {
      console.warn("S3 manifest missing apk_url / download_url");
      return null;
    }

    if (compareSemver(latestVersion, currentVersion) <= 0) {
      console.log("S3 manifest: app is up to date");
      return null;
    }

    console.log(`S3 manifest: update available ${currentVersion} -> ${latestVersion}`);
    return {
      update_available: true,
      current_version: currentVersion,
      latest_version: latestVersion,
      download_url: apkUrl,
      release_notes: manifest.release_notes || "",
      file_size: manifest.file_size || 0,
      force_update: Boolean(manifest.force_update),
      source: "s3",
    };
  }

  async checkGitHubRelease(currentVersion) {
    const releasesUrl = `${GITHUB_API_BASE}/${GITHUB_REPO}/releases/latest`;
    const response = await fetch(releasesUrl, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log("No releases found on GitHub");
        return null;
      }
      throw new Error(`Update check failed: ${response.status}`);
    }

    const release = await response.json();
    const latestTag = release.tag_name;
    const latestVersion = latestTag.replace(`${APP_NAME}-v`, "");

    if (compareSemver(latestVersion, currentVersion) <= 0) {
      console.log("GitHub: app is up to date");
      return null;
    }

    const apkAsset = release.assets.find(
      (asset) => asset.name.endsWith(".apk") && asset.name.includes(APP_NAME),
    );
    if (!apkAsset) {
      console.warn("APK asset not found in release");
      return null;
    }

    console.log(`GitHub: update available: ${latestVersion}`);
    return {
      update_available: true,
      current_version: currentVersion,
      latest_version: latestVersion,
      download_url: apkAsset.browser_download_url,
      release_notes: release.body || "",
      file_size: apkAsset.size,
      force_update: false,
      source: "github",
    };
  }

  async checkBackendUpdate(currentVersion) {
    const apiBase = getAPIBase();
    const url = `${apiBase}/updates/check/${APP_NAME}?current_version=${encodeURIComponent(
      currentVersion,
    )}&platform=${encodeURIComponent(PLATFORM)}`;
    const fallbackResponse = await fetch(url);
    if (!fallbackResponse.ok) {
      return null;
    }
    const data = await fallbackResponse.json();
    if (!data.update_available) {
      return null;
    }
    if (data.latest_version && compareSemver(data.latest_version, currentVersion) <= 0) {
      return null;
    }
    return { ...data, source: "backend" };
  }

  async checkForUpdate() {
    if (this.isChecking) {
      console.log("Update check already in progress...");
      return null;
    }

    this.isChecking = true;

    try {
      await this.ensureReady();
      const currentVersion = await this.getCurrentVersion();
      console.log(`Checking for updates... Current version: ${currentVersion}`);

      const s3 = await this.checkS3Manifest(currentVersion).catch((e) => {
        console.warn("S3 update check error:", e);
        return null;
      });
      if (s3) return s3;

      try {
        const gh = await this.checkGitHubRelease(currentVersion);
        if (gh) return gh;
      } catch (e) {
        console.error("GitHub update check error:", e);
      }

      const be = await this.checkBackendUpdate(currentVersion).catch((e) => {
        console.error("Backend update check error:", e);
        return null;
      });
      if (be) return be;

      return null;
    } finally {
      this.isChecking = false;
    }
  }

  async downloadApkNativeAndroid(fullUrl) {
    const { FileTransfer } = await import("@capacitor/file-transfer");
    const { Directory, Filesystem } = await import("@capacitor/filesystem");
    const { FileOpener } = await import("@capacitor-community/file-opener");

    const fileName = "norebox-tablet-update.apk";
    await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {});

    const { uri } = await Filesystem.getUri({
      path: fileName,
      directory: Directory.Cache,
    });

    await FileTransfer.downloadFile({
      url: fullUrl,
      path: uri,
      method: "GET",
    });

    await FileOpener.open({
      filePath: uri,
      contentType: "application/vnd.android.package-archive",
      openWithDefault: true,
    });
    return true;
  }

  async downloadAPK(downloadUrl) {
    const fullUrl = downloadUrl.startsWith("http")
      ? downloadUrl
      : `${getAPIBase()}${downloadUrl}?platform=${PLATFORM}`;

    if (isNativeAndroid()) {
      try {
        console.log("Downloading APK natively and opening installer…");
        return await this.downloadApkNativeAndroid(fullUrl);
      } catch (e) {
        console.warn("Native APK download/install failed, falling back to browser download:", e);
      }
    }

    const fileType = PLATFORM === "ios" ? "IPA" : "APK";
    console.log(`Downloading ${fileType}…`);

    const response = await fetch(fullUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `norebox-tablet-update.${PLATFORM === "ios" ? "ipa" : "apk"}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (PLATFORM === "ios") {
      console.log(
        "IPA downloaded. For iOS, native updates use TestFlight / MDM; web assets can reload from the server.",
      );
    } else {
      console.log("APK downloaded. Install from the notification or Downloads if the installer did not open.");
    }
    return true;
  }

  async installUpdate(updateInfo) {
    try {
      if (!updateInfo.download_url) {
        throw new Error("No download URL provided");
      }

      const downloaded = await this.downloadAPK(updateInfo.download_url);

      if (downloaded) {
        this.setVersion(updateInfo.latest_version);

        if (PLATFORM === "ios") {
          alert(
            "Update downloaded!\n\n" +
              "For iOS:\n" +
              "1. Web asset updates reload from your server on next open\n" +
              "2. Native app updates need TestFlight or enterprise distribution\n" +
              "3. Restart the app after installing if prompted",
          );
        } else if (!isNativeAndroid()) {
          alert(
            "Update downloaded!\n\n" +
              "Please install the APK:\n" +
              "1. Open your file manager or Downloads\n" +
              "2. Tap the downloaded APK\n" +
              "3. Allow install from this source if asked",
          );
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error installing update:", error);
      alert(`Update installation failed: ${error.message}`);
      return false;
    }
  }

  async checkAndUpdateNow(showPrompt = true) {
    const updateInfo = await this.checkForUpdate();

    if (!updateInfo) {
      return false;
    }

    if (updateInfo.force_update) {
      console.log("Force update required, installing…");
      return await this.installUpdate(updateInfo);
    }

    if (showPrompt) {
      const message =
        `Update available (${updateInfo.source || "unknown"})\n\n` +
        `Current: ${updateInfo.current_version}\n` +
        `Latest: ${updateInfo.latest_version}\n\n` +
        (updateInfo.release_notes ? `${updateInfo.release_notes}\n\n` : "") +
        `Install now?`;

      const shouldUpdate = confirm(message);

      if (shouldUpdate) {
        return await this.installUpdate(updateInfo);
      }
    } else {
      console.log("Scheduled update: installing new version…");
      return await this.installUpdate(updateInfo);
    }

    return false;
  }

  scheduleDailyCheck(hour = 2, minute = 0) {
    this.scheduledCheckTime = { hour, minute };
    this.stopScheduledChecks();

    this.checkInterval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === hour && now.getMinutes() === minute) {
        console.log(`Scheduled update check at ${hour}:${minute.toString().padStart(2, "0")}`);
        this.checkAndUpdateNow(false);
      }
    }, 60000);

    console.log(`Scheduled update check: Daily at ${hour}:${minute.toString().padStart(2, "0")}`);
  }

  async checkOnStartup() {
    console.log("Checking for updates on startup…");
    setTimeout(() => {
      this.checkAndUpdateNow(true);
    }, 3000);
  }

  stopScheduledChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export default new UpdateService();
