import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

// §14 M4: "Distributed via GitHub Releases. Auto-update via electron-updater
// configured against the github publish provider" (see electron-builder.yml's
// publish block). checkForUpdatesAndNotify() checks, downloads, and shows a
// native "restart to update" prompt on its own — no custom UI needed for a
// menubar-only app.
export function checkForUpdates(): void {
  if (!app.isPackaged) return; // no dev-app-update.yml in dev; nothing to check against
  void autoUpdater.checkForUpdatesAndNotify();
}
