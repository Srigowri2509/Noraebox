const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const APP_NAME = "display-app";

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
      
      const response = await fetch(
        `${API_BASE}/updates/check/${APP_NAME}?current_version=${currentVersion}&platform=${PLATFORM}`
      );
      
      if (!response.ok) {
        throw new Error(`Update check failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.update_available) {
        console.log(`✅ Update available: ${data.latest_version}`);
        return data;
      } else {
        console.log("✅ App is up to date");
        return null;
      }
    } catch (error) {
      console.error("Error checking for update:", error);
      return null;
    } finally {
      this.isChecking = false;
    }
  }

  async downloadAPK(downloadUrl) {
    try {
      const fileType = PLATFORM === 'ios' ? 'IPA' : 'APK';
      console.log(`Downloading ${fileType}...`);
      
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

