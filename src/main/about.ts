import { app, dialog } from 'electron';
import { t } from '@shared/i18n';
import { getLocale } from './locale';

// §12: the same native "About <App>" panel every other Mac app uses,
// rather than a hand-rolled dialog — app.showAboutPanel() only exists on
// macOS/Linux, so Windows still gets the plain message box it always had.
export function configureAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: 'Pulsar',
    applicationVersion: app.getVersion(),
    copyright: t('aboutDisclaimer', getLocale()),
    credits: 'findyourid13',
  });
}

export function showAboutPanel(): void {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    app.showAboutPanel();
    return;
  }
  const locale = getLocale();
  void dialog.showMessageBox({
    type: 'info',
    title: t('aboutTitle', locale),
    message: `Pulsar ${app.getVersion()}`,
    detail: t('aboutDisclaimer', locale),
  });
}
