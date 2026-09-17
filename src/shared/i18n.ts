// Locale detection is auto-only (from the OS), by explicit choice — no
// manual language picker in v1. Adding one later just means exposing a
// setting that overrides normalizeLocale's result; nothing else changes.

export type Locale = 'en' | 'ko';

export function normalizeLocale(raw: string): Locale {
  return raw.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

type Entry = { en: string; ko: string };

// Flat key -> {en, ko}, grouped by the file each string lives in. Keys stay
// close to their English text so a missing translation is obvious in review.
const STRINGS = {
  // tray.ts
  trayAppearance: { en: 'Appearance', ko: '외형' },
  traySpinning: { en: 'Spinning', ko: '회전' },
  trayCollection: { en: 'Collection', ko: '컬렉션' },
  trayConnection: { en: 'Connection', ko: '연결' },
  trayUtilities: { en: 'Utilities', ko: '유틸리티' },
  traySystem: { en: 'System', ko: '시스템' },
  traySignIn: { en: 'Sign in to Cosmo…', ko: 'Cosmo 로그인…' },
  traySignOut: { en: 'Sign out of Cosmo', ko: 'Cosmo 로그아웃' },
  trayNotSignedIn: { en: 'Source: Not signed in', ko: '소스: 로그인되지 않음' },
  trayUnavailable: { en: 'Source: Cosmo unavailable and nothing cached yet', ko: '소스: Cosmo에 연결할 수 없고 캐시된 데이터도 없음' },
  trayClickThroughCard: { en: 'Click through card', ko: '카드 클릭 통과' },
  trayCenterOnScreen: { en: 'Center on screen', ko: '화면 중앙으로' },
  trayLaunchAtLogin: { en: 'Launch at login', ko: '로그인 시 자동 실행' },
  trayAboutPulsar: { en: 'About Pulsar', ko: 'Pulsar 정보' },
  trayRevealLog: { en: 'Reveal log file', ko: '로그 파일 열기' },
  trayCheckForUpdates: { en: 'Check for Updates…', ko: '업데이트 확인…' },
  trayQuit: { en: 'Quit', ko: '종료' },

  // updater.ts
  updateDevBuild: { en: 'Updates aren’t available in a development build.', ko: '개발 빌드에서는 업데이트를 확인할 수 없습니다.' },
  updateUpToDate: { en: 'You’re up to date.', ko: '최신 버전을 사용하고 있습니다.' },
  updateCheckFailed: { en: 'Could not check for updates. Try again later.', ko: '업데이트를 확인할 수 없습니다. 나중에 다시 시도하세요.' },

  // menu-sections.ts
  menuNextObjekt: { en: 'Next objekt', ko: '다음 오브젝트' },
  menuPauseSpinning: { en: 'Pause spinning', ko: '회전 정지' },
  menuSize: { en: 'Size', ko: '크기' },
  menuOpacity: { en: 'Opacity', ko: '투명도' },
  menuSpinSpeed: { en: 'Spin speed', ko: '회전 속도' },
  menuSpinDirection: { en: 'Spin direction', ko: '회전 방향' },
  directionCw: { en: 'Clockwise', ko: '시계 방향' },
  directionCcw: { en: 'Counter-clockwise', ko: '반시계 방향' },
  shuffleNever: { en: 'Never', ko: '안 함' },
  menuRefreshCollection: { en: 'Refresh collection', ko: '컬렉션 새로고침' },
  menuRefreshing: { en: 'Refreshing…', ko: '새로고침 중…' },
  menuLastCachedNever: { en: 'Last cached: never', ko: '마지막 캐시: 없음' },
  menuChooseObjekts: { en: 'Choose objekts…', ko: '오브젝트 선택…' },
  menuShuffle: { en: 'Shuffle', ko: '셔플' },
  sizeXs: { en: 'Extra Small', ko: '아주 작게' },
  sizeS: { en: 'Small', ko: '작게' },
  sizeM: { en: 'Medium', ko: '보통' },
  sizeL: { en: 'Large', ko: '크게' },
  sizeXl: { en: 'Extra Large', ko: '아주 크게' },

  // about.ts
  aboutTitle: { en: 'About Pulsar', ko: 'Pulsar 정보' },
  aboutDisclaimer: {
    en: 'Pulsar is not affiliated with, endorsed by, or supported by MODHAUS or its artists.',
    ko: 'Pulsar는 MODHAUS 또는 소속 아티스트와 제휴, 승인, 후원 관계가 없습니다.',
  },

  // cosmo-auth.ts (statusError / session messages)
  errorTooManyAttempts: { en: 'Too many attempts — wait a bit and try again.', ko: '시도 횟수가 너무 많습니다 — 잠시 후 다시 시도하세요.' },
  errorCodeInvalid: { en: 'That code is incorrect or expired.', ko: '코드가 올바르지 않거나 만료되었습니다.' },
  errorEmailInvalid: { en: 'That doesn’t look like a valid email address.', ko: '올바른 이메일 주소가 아닌 것 같습니다.' },
  errorCouldNotReach: { en: 'Could not reach Cosmo. Check your connection and try again.', ko: 'Cosmo에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도하세요.' },
  errorSessionExpired: {
    en: 'Your Cosmo sign-in expired. Sign in again to keep your collection updating.',
    ko: 'Cosmo 로그인이 만료되었습니다. 컬렉션을 계속 업데이트하려면 다시 로그인하세요.',
  },
  errorSomethingWrong: { en: 'Something went wrong. Try again.', ko: '문제가 발생했습니다. 다시 시도하세요.' },

  // login-window.ts
  loginWindowTitle: { en: 'Sign in to Cosmo', ko: 'Cosmo 로그인' },
  loginEmailPrompt: {
    en: 'Enter your Cosmo email. Pulsar will send a 6-digit code to sign you in — no password.',
    ko: 'Cosmo 이메일을 입력하세요. Pulsar가 로그인용 6자리 코드를 보내드립니다 — 비밀번호는 필요 없습니다.',
  },
  loginCodePrompt: { en: 'Enter the 6-digit code Cosmo just emailed you.', ko: 'Cosmo가 방금 이메일로 보낸 6자리 코드를 입력하세요.' },
  loginNicknamePrompt: {
    en: 'Enter your Cosmo nickname, so Pulsar knows which collection is yours.',
    ko: 'Cosmo 닉네임을 입력하세요. Pulsar가 어떤 컬렉션이 내 것인지 알 수 있습니다.',
  },
  loginContinue: { en: 'Continue', ko: '계속' },
  loginSignIn: { en: 'Sign in', ko: '로그인' },
  loginFinish: { en: 'Finish', ko: '완료' },
  loginCancel: { en: 'Cancel', ko: '취소' },
  loginTryAgain: { en: 'Try again', ko: '다시 시도' },
  loginEnterEmail: { en: 'Enter your email.', ko: '이메일을 입력하세요.' },
  loginEnterCode: { en: 'Enter the code.', ko: '코드를 입력하세요.' },
  loginEnterNickname: { en: 'Enter your nickname.', ko: '닉네임을 입력하세요.' },
  loginNicknameNotFound: {
    en: 'Couldn’t find that Cosmo nickname. Check the spelling and try again.',
    ko: '해당 Cosmo 닉네임을 찾을 수 없습니다. 철자를 확인하고 다시 시도하세요.',
  },

  // renderer/login (Windows/Linux prompt window)
  loginEmailPlaceholder: { en: 'Email', ko: '이메일' },
  loginCodePlaceholder: { en: '6-digit code', ko: '6자리 코드' },
  loginNicknamePlaceholder: { en: 'Nickname', ko: '닉네임' },

  // renderer/collection
  collectionWindowTitle: { en: 'Choose objekts', ko: '오브젝트 선택' },
  collectionSearch: { en: 'Search', ko: '검색' },
  collectionSearchPlaceholder: { en: 'Member, season, class…', ko: '멤버, 시즌, 클래스…' },
  collectionArtist: { en: 'Artist', ko: '아티스트' },
  collectionMember: { en: 'Member', ko: '멤버' },
  collectionSeason: { en: 'Season', ko: '시즌' },
  collectionClass: { en: 'Class', ko: '클래스' },
  collectionType: { en: 'Type', ko: '유형' },
  collectionAll: { en: 'All', ko: '전체' },
  collectionOnline: { en: 'Online', ko: '온라인' },
  collectionOffline: { en: 'Offline', ko: '오프라인' },
  collectionSortBy: { en: 'Sort by', ko: '정렬 기준' },
  collectionNewest: { en: 'Newest', ko: '최신순' },
  collectionOldest: { en: 'Oldest', ko: '오래된순' },
  collectionColumns: { en: 'Columns', ko: '열 개수' },
  collectionSelectAll: { en: 'Select all shown', ko: '표시된 항목 모두 선택' },
  collectionClearSelection: { en: 'Clear selection', ko: '선택 해제' },
  collectionRefresh: { en: 'Refresh collection', ko: '컬렉션 새로고침' },
  collectionRefreshing: { en: 'Refreshing…', ko: '새로고침 중…' },
  collectionEmptyNoAccount: { en: 'No objekts loaded yet. Connect a Cosmo account first.', ko: '아직 로드된 오브젝트가 없습니다. 먼저 Cosmo 계정을 연결하세요.' },
  collectionEmptyNoMatch: { en: 'No objekts match these filters.', ko: '이 필터와 일치하는 오브젝트가 없습니다.' },
} as const satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, locale: Locale): string {
  return STRINGS[key][locale];
}

// --- Templated strings (interpolation needed) -------------------------------

export function trayVersionLabel(version: string): string {
  return `Pulsar v${version}`;
}

export function traySignedInAs(nickname: string, locale: Locale): string {
  return locale === 'ko' ? `소스: ${nickname}(으)로 로그인됨` : `Source: Signed in as ${nickname}`;
}

export function trayOfflineCached(nickname: string, locale: Locale): string {
  const name = nickname || 'Cosmo';
  return locale === 'ko' ? `소스: ${name} (오프라인, 캐시된 데이터 표시 중)` : `Source: ${name} (offline, showing cached)`;
}

export function shuffleEveryMinutes(minutes: number, locale: Locale): string {
  return locale === 'ko' ? `${minutes}분마다` : `Every ${minutes} min`;
}

export function lastCachedAt(date: string, locale: Locale): string {
  return locale === 'ko' ? `마지막 캐시: ${date}` : `Last cached: ${date}`;
}

export function collectionStatusNoneSelected(shown: number, total: number, locale: Locale): string {
  return locale === 'ko'
    ? `${total}개 중 ${shown}개 표시 — 선택된 항목이 없으면 전체가 로테이션에 포함됩니다`
    : `${shown} shown of ${total} — none selected means all are in rotation`;
}

export function collectionStatusSomeSelected(selectedShown: number, shown: number, totalSelected: number, locale: Locale): string {
  return locale === 'ko'
    ? `표시된 ${shown}개 중 ${selectedShown}개 선택됨 · 전체 ${totalSelected}개 선택됨`
    : `${selectedShown} of ${shown} shown selected · ${totalSelected} selected in total`;
}
