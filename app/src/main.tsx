import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { adoptKeyFromUrl } from "./lib/content";
import "./styles/global.css";

// Before the first render, so the start screen reports the key as present.
adoptKeyFromUrl();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker so the area pack and fonts stay available with no
// signal. Failure is non-fatal: the app just needs the network next time.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {});
  });
}
