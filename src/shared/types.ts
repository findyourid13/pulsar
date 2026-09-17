// §9 — data model

export type Objekt = {
  id: string; // stable local id
  frontImageUrl: string;
  frontVideoUrl?: string; // Motion-class objekts (§9) — front face plays this instead of frontImageUrl
  backImageUrl: string;
  backgroundColor?: string; // hex, used for the card edge tint
  textColor?: string; // hex, Cosmo's own designed contrast color for overlay text
  artist?: string;
  // e.g. "Summer25 id5 X id8 401Z" — for class 'Unit', this is the only
  // place the *second* paired member shows up; `member` only ever names one
  // of the two (see objekt-catalog.ts's objektMemberLabel).
  collectionId?: string;
  member?: string;
  season?: string;
  collectionNo?: string;
  class?: string;
  source: 'local' | 'remote';
};

// §10 — settings, persisted via electron-store

export type Settings = {
  version: 1;
  window: {
    sizePreset: 'xs' | 's' | 'm' | 'l' | 'xl';
    positions: Record<string, { x: number; y: number }>; // keyed by display id
    lastDisplayId: string | null;
  };
  spin: {
    periodSeconds: number; // default 32
    direction: 'cw' | 'ccw';
    paused: boolean;
  };
  display: {
    opacity: number; // 0.3–1.0, default 1.0
    parallax: boolean;
    idleBob: boolean;
  };
  objekts: {
    selectedIds: string[];
    shuffleMinutes: number | null; // null = never
    // Populated by signing in with a Cosmo email (§9). Login (email + code)
    // proves the user owns the account; `address` still comes from the
    // public by-nickname lookup, not from the auth provider's linked wallet
    // — that embedded-wallet address is a signing key, not the Abstract
    // smart-wallet address the objekt contract actually tracks as owner, so
    // it can't be used for on-chain lookups directly. The address is what the
    // credential-free on-chain fallback path needs (see remote-source.ts).
    cosmoAccount: { email: string; nickname: string; address: string } | null;
    // The Cosmo session that login mints, kept so remote-source can call the
    // authenticated /bff/v3/objekt-summaries path — which is the only source
    // of real front/back artwork for every objekt. Deliberately persisted,
    // reversing §9's earlier "no standing session" rule (design doc §9 Login,
    // revised 2026-09-15). accessToken is short-lived; a 401 buys a fresh
    // pair with refreshToken, and this is rewritten in place. Null until the
    // user signs in, and cleared on sign-out along with cosmoAccount.
    cosmoSession: { accessToken: string; refreshToken: string } | null;
  };
  system: {
    launchAtLogin: boolean;
    hotkey: string | null;
    throttleOnBattery: boolean; // default true
    // §6: when true, the card stops capturing clicks entirely — every click
    // passes through to whatever's underneath, same as empty window space
    // always has. No modifier re-enables it; toggle back off from the tray.
    alwaysClickThrough: boolean;
  };
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// §11 — IPC contract, exposed on window.pulsar via contextBridge

export const IpcChannel = {
  HitPointerOverCard: 'hit:pointer-over-card',
  WindowDrag: 'window:drag',
  WindowDragEnd: 'window:drag-end',
  SettingsGet: 'settings:get',
  SettingsPatch: 'settings:patch',
  SettingsChanged: 'settings:changed',
  ObjektCurrentGet: 'objekt:current-get',
  ObjektCurrent: 'objekt:current',
  ObjektNext: 'objekt:next',
  ObjektShuffle: 'objekt:shuffle',
  ObjektListGet: 'objekt:list-get',
  ObjektCollectionRefresh: 'objekt:collection-refresh',
  RenderThrottle: 'render:throttle',
  CardContextMenu: 'card:context-menu',
  CardFace: 'card:face',
  LoginSendCode: 'login:send-code',
  LoginVerifyCode: 'login:verify-code',
  LoginResolveNickname: 'login:resolve-nickname',
  LoginCancel: 'login:cancel',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

export type RenderThrottlePayload = { fps: number | 'pause' };
export type CardFace = 'front' | 'back';

// §9 login (email + 6-digit code via Cosmo's own auth backend) — both IPC calls
// are request/response so the login window can show the error inline and let
// the user retry instead of the window just closing on failure.
export type LoginResult = { ok: true } | { ok: false; error: string };
