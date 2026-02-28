// Runtime configuration - can be updated remotely
// This file can be served from your backend and updated without rebuilding APK

export const getConfig = () => {
  // Try to get config from localStorage (updated remotely)
  const remoteConfig = localStorage.getItem('app_config');
  if (remoteConfig) {
    try {
      const config = JSON.parse(remoteConfig);
      // Check if cached config has old URL - if so, clear it
      if (config.api_url && config.api_url.includes('98.130.120.10')) {
        console.log('⚠️ Clearing cached config with old URL:', config.api_url);
        localStorage.removeItem('app_config');
        // Return default config with new URL
        return {
          api_url: 'http://16.112.20.5:8000',
          update_check_url: 'http://16.112.20.5:8000',
          version: '1.0.0'
        };
      }
      if (config.api_url) {
        return config;
      }
    } catch (e) {
      console.warn('Failed to parse remote config:', e);
      localStorage.removeItem('app_config'); // Clear invalid config
    }
  }
  
  // Default config (fallback)
  return {
    api_url: 'http://16.112.20.5:8000',
    update_check_url: 'http://16.112.20.5:8000',
    version: '1.0.0'
  };
};

// Load config from server on startup
export const loadRemoteConfig = async () => {
  try {
    // Try to fetch config from backend
    // First, try the default IP
    const defaultApiUrl = 'http://16.112.20.5:8000';
    
    const response = await fetch(`${defaultApiUrl}/config/app-config.json`, {
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (response.ok) {
      const config = await response.json();
      localStorage.setItem('app_config', JSON.stringify(config));
      console.log('✅ Loaded remote config:', config);
      return config;
    }
  } catch (error) {
    console.warn('Could not load remote config, using defaults:', error);
  }
  
  return getConfig();
};

