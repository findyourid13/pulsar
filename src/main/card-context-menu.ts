import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IpcChannel } from '@shared/types';
import { menuSymbol } from './menu-icon';
import { buildChooseObjektsItem, buildNextObjektItem, buildPauseSpinningItem } from './menu-sections';
import { getSettings } from './settings';

// §8: right-click on the card is a deliberately small subset of the tray
// (§12) — Next objekt, Pause spinning, Face front/back, Choose objekts,
// Quit — reusing the same item-builders as the tray so wording/icons can't
// drift between the two.
export function showCardContextMenu(win: BrowserWindow): void {
  const settings = getSettings();
  const template: MenuItemConstructorOptions[] = [
    buildNextObjektItem(),
    buildPauseSpinningItem(settings),
    { type: 'separator' },
    {
      label: 'Face front',
      icon: menuSymbol('1.square'),
      click: () => win.webContents.send(IpcChannel.CardFace, 'front'),
    },
    {
      label: 'Face back',
      icon: menuSymbol('2.square'),
      click: () => win.webContents.send(IpcChannel.CardFace, 'back'),
    },
    { type: 'separator' },
    buildChooseObjektsItem(win),
    { type: 'separator' },
    { label: 'Quit', icon: menuSymbol('rectangle.portrait.and.arrow.right'), click: () => app.quit() },
  ];
  Menu.buildFromTemplate(template).popup({ window: win });
}
