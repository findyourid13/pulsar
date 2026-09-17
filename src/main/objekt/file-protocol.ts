import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';

// Local-source images are served through this custom scheme rather than raw
// file:// URLs. In dev, the renderer's origin is http://localhost (Vite's
// dev server), and Chromium blocks file:// loads from an http: origin as
// cross-origin — a privileged custom scheme with corsEnabled sidesteps that,
// and works identically in a packaged build's file://-origin renderer too.
export const OBJEKT_FILE_SCHEME = 'pulsar-objekt';

// Must run at module load, before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: OBJEKT_FILE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

export function toObjektFileUrl(absolutePath: string): string {
  return `${OBJEKT_FILE_SCHEME}://local${encodeURI(absolutePath)}`;
}

// Call inside app.whenReady().
export function registerObjektFileProtocol(): void {
  protocol.handle(OBJEKT_FILE_SCHEME, (request) => {
    const url = new URL(request.url);
    const absolutePath = decodeURI(url.pathname);
    return net.fetch(pathToFileURL(absolutePath).href);
  });
}
