import { app, dialog } from 'electron';

// §12: the same native "About <App>" panel every other Mac app uses,
// rather than a hand-rolled dialog — app.showAboutPanel() only exists on
// macOS/Linux, so Windows still gets the plain message box it always had.
export function configureAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: 'Pulsar',
    applicationVersion: app.getVersion(),
    copyright: 'Pulsar is not affiliated with, endorsed by, or supported by MODHAUS or its artists.',
    credits: 'seorinnn',
  });
}

export function showAboutPanel(): void {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    app.showAboutPanel();
    return;
  }
  void dialog.showMessageBox({
    type: 'info',
    title: 'About Pulsar',
    message: `Pulsar ${app.getVersion()}`,
    detail: 'Pulsar is not affiliated with, endorsed by, or supported by MODHAUS or its artists.',
  });
}
