import { app } from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

// A packaged Windows/Mac build launched by double-click has no visible
// console — console.log/error go nowhere anyone can ever see them. This
// writes the same lines to a plain text file next to Settings, so a report
// like "it crashed" can turn into an actual stack trace someone can send.
const LOG_PATH = join(app.getPath('userData'), 'pulsar.log');

function write(level: string, args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${level}: ${args.map(String).join(' ')}\n`;
  try {
    appendFileSync(LOG_PATH, line);
  } catch {
    // Nothing else to fall back to — if the log file itself can't be
    // written, there's no user-visible way to surface that either.
  }
}

export function logInfo(...args: unknown[]): void {
  write('INFO', args);
}

export function logError(...args: unknown[]): void {
  write('ERROR', args);
}

export function logFilePath(): string {
  return LOG_PATH;
}

// Registering these handlers changes Node's default behavior: normally an
// uncaught exception prints to stderr (invisible in a packaged GUI app) and
// kills the process outright — exactly "the window never opens and the app
// just disappears," reported on Windows for the collection browser, with no
// way to tell why. With a handler installed, Node no longer auto-exits, so
// this logs the real error and lets the app keep running instead.
export function installCrashLogging(): void {
  logInfo('startup, log file at', LOG_PATH);

  process.on('uncaughtException', (error) => {
    logError('uncaughtException:', error.stack ?? error.message);
  });
  process.on('unhandledRejection', (reason) => {
    logError('unhandledRejection:', reason instanceof Error ? (reason.stack ?? reason.message) : String(reason));
  });
  // A renderer (e.g. the collection browser) or a utility/GPU process dying
  // doesn't throw anywhere catchable — these are the only signal at all.
  app.on('render-process-gone', (_event, webContents, details) => {
    logError('render-process-gone:', webContents.getURL(), JSON.stringify(details));
  });
  app.on('child-process-gone', (_event, details) => {
    logError('child-process-gone:', JSON.stringify(details));
  });
}
