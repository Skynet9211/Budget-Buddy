import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.budgetbuddy.app",
  appName: "Budget Buddy",
  webDir: "dist",
  backgroundColor: "#F5EFE6",
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#F5EFE6",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#F5EFE6",
    },
  },
};

export default config;
