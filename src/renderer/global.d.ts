import type { CardFace, DeepPartial, LoginResult, Objekt, RenderThrottlePayload, Settings } from '@shared/types';
import type { Locale } from '@shared/i18n';

declare global {
  interface Window {
    pulsar: {
      getLocale(): Promise<Locale>;
      reportPointerOverCard(over: boolean): void;
      dragWindow(dx: number, dy: number): void;
      endDragWindow(): void;
      getSettings(): Promise<Settings>;
      patchSettings(patch: DeepPartial<Settings>): Promise<Settings>;
      onSettingsChanged(listener: (settings: Settings) => void): () => void;
      getCurrentObjekt(): Promise<Objekt | null>;
      onObjektCurrent(listener: (objekt: Objekt | null) => void): () => void;
      requestNextObjekt(): void;
      onObjektShuffle(listener: (objekt: Objekt | null) => void): () => void;
      requestContextMenu(): void;
      onCardFace(listener: (face: CardFace) => void): () => void;
      getObjektList(): Promise<Objekt[]>;
      refreshCollection(): Promise<Objekt[]>;
      onRenderThrottle(listener: (payload: RenderThrottlePayload) => void): () => void;
      sendLoginCode(email: string): Promise<LoginResult>;
      verifyLoginCode(email: string, code: string): Promise<LoginResult>;
      resolveCosmoNickname(email: string, nickname: string): Promise<LoginResult>;
      cancelLogin(): void;
    };
  }
}

export {};
