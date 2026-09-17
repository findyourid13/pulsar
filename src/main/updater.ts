import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { t } from '@shared/i18n';
import { getLocale } from './locale';

// electron-updater's default (allowPrerelease: false, since our version
// string carries no semver prerelease suffix like "-beta.1") resolves the
// latest version via GitHub's /releases/latest API — which by definition
// excludes prereleases and 404s when a repo has published only prereleases,
// exactly the case during this testing phase. allowPrerelease: true switches
// it to the releases Atom feed instead, which does list them. Revisit once
// a real stable (non-prerelease) version is cut — this will keep pulling in
// prereleases after that point too, since it has no explicit channel set.
autoUpdater.allowPrerelease = true;

// §14 M4: "Distributed via GitHub Releases. Auto-update via electron-updater
// configured against the github publish provider" (see electron-builder.yml's
// publish block). checkForUpdatesAndNotify() checks, downloads, and shows a
// native "restart to update" prompt on its own — no custom UI needed for a
// menubar-only app.
export function checkForUpdates(): void {
  if (!app.isPackaged) return; // no dev-app-update.yml in dev; nothing to check against
  void autoUpdater.checkForUpdatesAndNotify();
}

// Tray-triggered manual check. Unlike the silent startup check above, a
// button someone just clicked needs to say *something* even when there's
// nothing new — checkForUpdatesAndNotify() already covers "an update
// exists" with its own native prompt, so this only adds feedback for the
// two outcomes that would otherwise be a click into silence.
export function checkForUpdatesManually(): void {
  const locale = getLocale();
  if (!app.isPackaged) {
    void dialog.showMessageBox({ type: 'info', message: t('updateDevBuild', locale) });
    return;
  }

  const cleanup = (): void => {
    autoUpdater.off('update-not-available', onNotAvailable);
    autoUpdater.off('error', onError);
  };
  const onNotAvailable = (): void => {
    cleanup();
    void dialog.showMessageBox({ type: 'info', message: t('updateUpToDate', locale) });
  };
  const onError = (): void => {
    cleanup();
    void dialog.showMessageBox({ type: 'error', message: t('updateCheckFailed', locale) });
  };
  autoUpdater.once('update-not-available', onNotAvailable);
  autoUpdater.once('error', onError);
  void autoUpdater.checkForUpdatesAndNotify();
}
