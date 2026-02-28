const API_BASE = import.meta.env.VITE_API_URL || "http://16.112.20.5:8000";
const APP_NAME = "display-app";

// GitHub configuration - can be set via environment variable or config
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || "Srigowri2509/Noraebox";
const GITHUB_API_BASE = "https://api.github.com/repos";

// Detect platform
const getPlatform = () => {
  if (typeof window === 'undefined') return 'web';
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
  if (/android/.test(userAgent)) return 'android';
  return 'web';
};

const PLATFORM = getPlatform();

class UpdateService {
  constructor() {
    this.checkInterval = null;
    this.scheduledCheckTime = null;
    this.isChecking = false;
    this.capacitorAvailable = false;
    this.initCapacitor();
  }

  async initCapacitor() {
    try {
      const { App } = await import('@capacitor/app');
      this.App = App;
      this.capacitorAvailable = true;
    } catch (error) {
      this.capacitorAvailable = false;
      console.log("Running in web mode - Capacitor not available");
    }
  }

  async getCurrentVersion() {
    try {
      if (this.capacitorAvailable && this.App) {
        const info = await this.App.getInfo();
        return info.version || "0.0.0";
      } else {
        const storedVersion = localStorage.getItem('app_version') || "0.0.0";
        return storedVersion;
      }
    } catch (error) {
      console.error("Error getting app version:", error);
      return localStorage.getItem('app_version') || "0.0.0";
    }
  }

  setVersion(version) {
    localStorage.setItem('app_version', version);
  }

  async checkForUpdate() {
    if (this.isChecking) {
      console.log("Update check already in progress...");
      return null;
    }

    this.isChecking = true;
    
    try {
      const currentVersion = await this.getCurrentVersion();
      console.log(`Checking for updates... Current version: ${currentVersion}`);
      
      // Check GitHub Releases
      const releasesUrl = `${GITHUB_API_BASE}/${GITHUB_REPO}/releases/latest`;
      
      const response = await fetch(releasesUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log("No releases found on GitHub");
          return null;
        }
        throw new Error(`Update check failed: ${response.status}`);
      }
      
      const release = await response.json();
      
      // Extract version from tag (e.g., "display-app-v1.0.1" -> "1.0.1")
      const latestTag = release.tag_name;
      const latestVersion = latestTag.replace(`${APP_NAME}-v`, '');
      
      // Compare versions
      const updateAvailable = latestVersion !== currentVersion;
      
      if (updateAvailable) {
        // Find APK asset
        const apkAsset = release.assets.find(asset => 
          asset.name.endsWith('.apk') && asset.name.includes(APP_NAME)
        );
        
        if (!apkAsset) {
          console.warn("APK asset not found in release");
          return null;
        }
        
        console.log(`✅ Update available: ${latestVersion}`);
        return {
          update_available: true,
          current_version: currentVersion,
          latest_version: latestVersion,
          download_url: apkAsset.browser_download_url,
          release_notes: release.body || "",
          file_size: apkAsset.size,
          force_update: false
        };
      } else {
        console.log("✅ App is up to date");
        return null;
      }
    } catch (error) {
      console.error("Error checking for update:", error);
      // Fallback to local backend if GitHub check fails
      try {
        const fallbackResponse = await fetch(
          `${API_BASE}/updates/check/${APP_NAME}?current_version=${await this.getCurrentVersion()}&platform=${PLATFORM}`
        );
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          if (data.update_available) {
            return data;
          }
        }
      } catch (fallbackError) {
        console.error("Fallback update check also failed:", fallbackError);
      }
      return null;
    } finally {
      this.isChecking = false;
    }
  }

  async downloadAPK(downloadUrl) {
    try {
      const fileType = PLATFORM === 'ios' ? 'IPA' : 'APK';
      console.log(`Downloading ${fileType} from GitHub...`);
      
      // downloadUrl should already be the GitHub download URL
      const fullUrl = downloadUrl.startsWith('http') 
        ? downloadUrl 
        : `${API_BASE}${downloadUrl}?platform=${PLATFORM}`;
      
      const response = await fetch(fullUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `norebox-display-update.${PLATFORM === 'ios' ? 'ipa' : 'apk'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      if (PLATFORM === 'ios') {
        console.log("IPA downloaded. For iOS, web asset updates are applied automatically.");
      } else {
        console.log("APK downloaded. Please install manually or use native installer.");
      }
      return true;
    } catch (error) {
      console.error(`Error downloading ${PLATFORM === 'ios' ? 'IPA' : 'APK'}:`, error);
      throw error;
    }
  }

  async installUpdate(updateInfo) {
    try {
      if (!updateInfo.download_url) {
        throw new Error("No download URL provided");
      }

      const downloaded = await this.downloadAPK(updateInfo.download_url);
      
      if (downloaded) {
        // Update stored version
        this.setVersion(updateInfo.latest_version);
        
        // For TV/Display, show minimal notification
        console.log("Update downloaded. Installation required.");
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error installing update:", error);
      return false;
    }
  }

  async checkAndUpdateNow(showPrompt = false) {
    const updateInfo = await this.checkForUpdate();
    
    if (!updateInfo) {
      return false;
    }

    if (updateInfo.force_update) {
      // Force update - install immediately
      console.log("Force update required, installing...");
      return await this.installUpdate(updateInfo);
    }

    // For display app, usually silent updates
    return await this.installUpdate(updateInfo);
  }

  scheduleDailyCheck(hour = 3, minute = 0) {
    this.scheduledCheckTime = { hour, minute };
    
    this.stopScheduledChecks();
    
    this.checkInterval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === hour && now.getMinutes() === minute) {
        console.log(`Scheduled update check at ${hour}:${minute.toString().padStart(2, '0')}`);
        this.checkAndUpdateNow(false);
      }
    }, 60000);
    
    console.log(`📅 Scheduled update check: Daily at ${hour}:${minute.toString().padStart(2, '0')}`);
  }

  async checkOnStartup() {
    console.log("🚀 Checking for updates on startup...");
    setTimeout(() => {
      this.checkAndUpdateNow(false);
    }, 5000); // Wait longer for TV/display app
  }

  stopScheduledChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export default new UpdateService();

