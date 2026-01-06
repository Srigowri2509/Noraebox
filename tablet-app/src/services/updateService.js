import { getConfig } from '../config';

// Get API URL from runtime config (can be updated remotely)
function getApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const config = getConfig();
  return config.api_url || "http://192.168.1.16:8000";
}

// Get fresh API base each time
const getAPIBase = () => getApiBase();
const APP_NAME = "tablet-app";

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
      // Try to import Capacitor App (only available in Capacitor builds)
      const { App } = await import('@capacitor/app');
      this.App = App;
      this.capacitorAvailable = true;
    } catch (error) {
      // Capacitor not available (web mode) - that's okay
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
        // Web mode: get from localStorage or use default
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
      
      const apiBase = getAPIBase();
      const response = await fetch(
        `${apiBase}/updates/check/${APP_NAME}?current_version=${currentVersion}&platform=${PLATFORM}`
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
      
      const apiBase = getAPIBase();
      const fullUrl = downloadUrl.startsWith('http') 
        ? downloadUrl 
        : `${apiBase}${downloadUrl}?platform=${PLATFORM}`;
      
      const response = await fetch(fullUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `norebox-tablet-update.${PLATFORM === 'ios' ? 'ipa' : 'apk'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      if (PLATFORM === 'ios') {
        console.log("IPA downloaded. For iOS, updates are typically handled via TestFlight or Enterprise distribution.");
        console.log("Web asset updates can be applied automatically without rebuilding the native app.");
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

      // For web/Capacitor, we'll download and prompt user to install
      // For native Android, we'd use native installer
      const downloaded = await this.downloadAPK(updateInfo.download_url);
      
      if (downloaded) {
        // Update stored version
        this.setVersion(updateInfo.latest_version);
        
        // Show instructions based on platform
        if (PLATFORM === 'ios') {
          alert(
            "Update downloaded!\n\n" +
            "For iOS:\n" +
            "1. Web asset updates are applied automatically\n" +
            "2. Native app updates require TestFlight or Enterprise distribution\n" +
            "3. Restart the app to see web asset updates"
          );
        } else {
          alert(
            "Update downloaded!\n\n" +
            "Please install the downloaded APK:\n" +
            "1. Open your device's file manager\n" +
            "2. Find the downloaded APK\n" +
            "3. Tap to install\n\n" +
            "Or the app will attempt to install automatically if supported."
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
      // Force update - install immediately
      console.log("Force update required, installing...");
      return await this.installUpdate(updateInfo);
    }

    if (showPrompt) {
      const message = 
        `🆕 Update Available!\n\n` +
        `Current: ${updateInfo.current_version}\n` +
        `Latest: ${updateInfo.latest_version}\n\n` +
        (updateInfo.release_notes ? `${updateInfo.release_notes}\n\n` : '') +
        `Would you like to install now?`;
      
      const shouldUpdate = confirm(message);
      
      if (shouldUpdate) {
        return await this.installUpdate(updateInfo);
      }
    } else {
      // Silent update (for scheduled checks)
      console.log("Scheduled update check found new version, installing...");
      return await this.installUpdate(updateInfo);
    }

    return false;
  }

  scheduleDailyCheck(hour = 2, minute = 0) {
    this.scheduledCheckTime = { hour, minute };
    
    // Clear existing interval
    this.stopScheduledChecks();
    
    // Check every minute if it's time
    this.checkInterval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === hour && now.getMinutes() === minute) {
        console.log(`Scheduled update check at ${hour}:${minute.toString().padStart(2, '0')}`);
        this.checkAndUpdateNow(false); // Silent check
      }
    }, 60000); // Check every minute
    
    console.log(`📅 Scheduled update check: Daily at ${hour}:${minute.toString().padStart(2, '0')}`);
  }

  async checkOnStartup() {
    console.log("🚀 Checking for updates on startup...");
    // Wait a bit for app to fully load
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

