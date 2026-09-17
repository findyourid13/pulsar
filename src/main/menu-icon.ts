import { nativeImage, type NativeImage } from 'electron';

// createMenuSymbol has no size/scale parameter, and renders noticeably
// larger than the ".small" symbol scale real menu items use (AppKit's own
// menu-symbol configuration isn't exposed through Electron's API at all) —
// verified directly: 'arrow.right.circle' comes back 15x15 where a native
// Finder-style menu icon reads closer to 12x12. Resizing down is the only
// lever available; resize() silently drops the template-image flag (its
// adaptive light/dark/selected-row tinting), so it has to be re-applied
// after.
const MENU_SYMBOL_HEIGHT_PX = 12;

// SF Symbols (createMenuSymbol) only exist on macOS — an undefined `icon`
// on a MenuItemConstructorOptions is simply omitted, so Windows/Linux just
// render with no icon rather than needing a separate fallback asset per
// item.
export function menuSymbol(name: string): NativeImage | undefined {
  if (process.platform !== 'darwin') return undefined;
  const resized = nativeImage.createMenuSymbol(name).resize({ height: MENU_SYMBOL_HEIGHT_PX });
  resized.setTemplateImage(true);
  return resized;
}
