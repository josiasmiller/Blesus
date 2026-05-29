import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { initializeUi } from "@/stores/ui";
import { useAccountsStore } from "@/stores/accounts";
import { attachWindowPersistence, restoreWindowState } from "@/lib/window";
import { attachTaskbarBadge } from "@/lib/badge";
import { attachAutostart } from "@/lib/autostart";
import { attachCloseToTray } from "@/lib/closeToTray";
import { backfillContactsFromSearchIndex } from "@/lib/db";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "@/styles/globals.css";

async function boot() {
  // Show the window first so it's visible even if initializeUi() is slow.
  await restoreWindowState();

  try {
    await initializeUi();
  } catch (err) {
    console.error("initializeUi failed:", err);
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );

  void useAccountsStore.getState().loadAccounts();
  void attachWindowPersistence();
  attachTaskbarBadge();
  attachAutostart();
  void attachCloseToTray();

  // One-shot population of the composer autocomplete pool from any
  // already-indexed senders. Idempotent: safe to run on every boot.
  void backfillContactsFromSearchIndex().catch((err) =>
    console.warn("contacts backfill failed:", err),
  );
}

boot().catch((err) => console.error("boot failed:", err));
