import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ThemeToggle from "./components/ThemeToggle";
import AppearancePage from "./components/AppearancePage";
import { initTheme } from "./hooks/useTheme";
import "./index.css";

// Set the theme before the first paint so a dark-mode user doesn't see a light flash.
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <ThemeToggle />
      <AppearancePage />
    </BrowserRouter>
  </StrictMode>,
);
