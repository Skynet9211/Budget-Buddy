import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ThemeToggle from "./components/ThemeToggle";
import { applyTheme, initialTheme } from "./hooks/useTheme";
import "./styles/theme.css";
import "./styles/transactions.css";
import "./styles/dashboard.css";

// Set the theme before the first paint so a dark-mode user doesn't see a light flash.
applyTheme(initialTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <ThemeToggle />
  </StrictMode>,
);
