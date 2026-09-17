import type { Objekt } from '@shared/types';
import {
  ALL_ARTISTS,
  ARTIST_CLASSES,
  ARTIST_MEMBERS,
  ARTIST_SEASONS,
  artistDisplayName,
  memberDisplayName,
  objektMemberLabel,
} from '@shared/objekt-catalog';
import { collectionStatusNoneSelected, collectionStatusSomeSelected, t, type Locale, type StringKey } from '@shared/i18n';

let locale: Locale = 'en';

// Walks every element carrying a data-i18n(-placeholder) attribute set in
// the static HTML, so adding a new translated element there needs no
// matching getElementById line here.
function applyStaticI18n(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset['i18n'] as StringKey, locale);
  }
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset['i18nPlaceholder'] as StringKey, locale);
  }
}

// M4 collection browser (built early — see design doc §14). Filters mirror
// objekt.top's own facets: artist, member, season, class, type, sort,
// adjustable grid columns. "Edition" and "Color" are skipped — Pulsar's
// Objekt model has no such fields, and there's no credential-free Cosmo
// endpoint that would supply them (see §9's remote-source notes).

type SortKey = 'newest' | 'oldest' | 'member' | 'season' | 'class';

// objekt.top's own "Online"/"Offline" distinction, derived the same way
// apollo.cafe's indexer does it (packages/util): a collection number
// containing "Z" is an online-exclusive release.
function objektType(objekt: Objekt): 'Online' | 'Offline' | undefined {
  if (!objekt.collectionNo) return undefined;
  return objekt.collectionNo.includes('Z') ? 'Online' : 'Offline';
}

// Abstract assigns token IDs incrementally at mint time, so a larger
// numeric id is a reasonable proxy for "newer" without needing a real
// mint timestamp (which would need an indexer — see §9).
function numericId(objekt: Objekt): number {
  const n = Number(objekt.id);
  return Number.isFinite(n) ? n : 0;
}

function sortObjekts(list: Objekt[], sortKey: SortKey): Objekt[] {
  const sorted = [...list];
  switch (sortKey) {
    case 'newest':
      sorted.sort((a, b) => numericId(b) - numericId(a));
      break;
    case 'oldest':
      sorted.sort((a, b) => numericId(a) - numericId(b));
      break;
    case 'member':
      sorted.sort((a, b) => (a.member ?? '').localeCompare(b.member ?? ''));
      break;
    case 'season':
      sorted.sort((a, b) => (a.season ?? '').localeCompare(b.season ?? ''));
      break;
    case 'class':
      sorted.sort((a, b) => (a.class ?? '').localeCompare(b.class ?? ''));
      break;
  }
  return sorted;
}

const searchInput = document.getElementById('search') as HTMLInputElement;
const artistSelect = document.getElementById('filter-artist') as HTMLSelectElement;
const memberSelect = document.getElementById('filter-member') as HTMLSelectElement;
const seasonSelect = document.getElementById('filter-season') as HTMLSelectElement;
const classSelect = document.getElementById('filter-class') as HTMLSelectElement;
const typeSelect = document.getElementById('filter-type') as HTMLSelectElement;
const sortSelect = document.getElementById('sort') as HTMLSelectElement;
const columnsInput = document.getElementById('columns') as HTMLInputElement;
const selectAllButton = document.getElementById('select-all') as HTMLButtonElement;
const clearSelectionButton = document.getElementById('clear-selection') as HTMLButtonElement;
const refreshButton = document.getElementById('refresh-collection') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const gridEl = document.getElementById('grid') as HTMLDivElement;

let allObjekts: Objekt[] = [];
let selectedIds = new Set<string>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistSelection(): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void window.pulsar.patchSettings({ objekts: { selectedIds: [...selectedIds] } });
  }, 150);
}

function populateSelect(select: HTMLSelectElement, values: string[], labelFor: (value: string) => string = (v) => v): void {
  const current = select.value;
  select.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = t('collectionAll', locale);
  select.append(allOption);
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelFor(value);
    select.append(option);
  }
  if (values.includes(current)) select.value = current;
}

// Grouped by artist, like objekt.top's own member filter — otherwise
// identical members across the two S1-numbered/non-numbered systems would
// be indistinguishable in a flat list.
function populateMemberSelect(): void {
  const current = memberSelect.value;
  memberSelect.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = t('collectionAll', locale);
  memberSelect.append(allOption);
  for (const artistId of ALL_ARTISTS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = artistDisplayName(artistId);
    for (const member of ARTIST_MEMBERS[artistId] ?? []) {
      const option = document.createElement('option');
      option.value = member;
      option.textContent = memberDisplayName(artistId, member);
      optgroup.append(option);
    }
    memberSelect.append(optgroup);
  }
  if ([...memberSelect.options].some((option) => option.value === current)) memberSelect.value = current;
}

function matchesFilters(objekt: Objekt): boolean {
  // artistSelect.value is always one of the canonical ALL_ARTISTS labels
  // ("ARTMS"), but Cosmo's own raw artist field has been observed in a
  // different casing (design doc §9's validArtists keys it "artms") — both
  // sides need normalizing through the same table to compare correctly.
  if (artistSelect.value && artistDisplayName(objekt.artist) !== artistSelect.value) return false;
  if (memberSelect.value && objekt.member !== memberSelect.value) return false;
  if (seasonSelect.value && objekt.season !== seasonSelect.value) return false;
  if (classSelect.value && objekt.class !== classSelect.value) return false;
  if (typeSelect.value && objektType(objekt) !== typeSelect.value) return false;

  const query = searchInput.value.trim().toLowerCase();
  if (!query) return true;
  const haystack = [objekt.artist, objekt.member, objekt.season, objekt.class, objekt.collectionNo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function toggleSelection(objekt: Objekt): void {
  if (selectedIds.has(objekt.id)) {
    selectedIds.delete(objekt.id);
  } else {
    selectedIds.add(objekt.id);
  }
  persistSelection();
  render();
}

function render(): void {
  const shown = sortObjekts(allObjekts.filter(matchesFilters), sortSelect.value as SortKey);

  gridEl.innerHTML = '';
  if (allObjekts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('collectionEmptyNoAccount', locale);
    gridEl.append(empty);
  } else if (shown.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('collectionEmptyNoMatch', locale);
    gridEl.append(empty);
  } else {
    for (const objekt of shown) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb' + (selectedIds.has(objekt.id) ? ' selected' : '');
      thumb.addEventListener('click', () => toggleSelection(objekt));

      const img = document.createElement('img');
      img.src = objekt.frontImageUrl;
      img.loading = 'lazy';
      img.alt = objektMemberLabel(objekt) || objekt.id;
      thumb.append(img);

      const check = document.createElement('div');
      check.className = 'check';
      check.textContent = '✓';
      thumb.append(check);

      const captionText = [objektMemberLabel(objekt) || undefined, objekt.collectionNo]
        .filter(Boolean)
        .join(' · ');
      if (captionText) {
        const caption = document.createElement('div');
        caption.className = 'caption';
        caption.textContent = captionText;
        thumb.append(caption);
      }

      gridEl.append(thumb);
    }
  }

  const selectedShownCount = shown.filter((o) => selectedIds.has(o.id)).length;
  statusEl.textContent =
    selectedIds.size === 0
      ? collectionStatusNoneSelected(shown.length, allObjekts.length, locale)
      : collectionStatusSomeSelected(selectedShownCount, shown.length, selectedIds.size, locale);
}

// Artist/member/season/class options come from the static catalog (every
// group, every member, every known season/class), not from whatever's
// actually loaded — matching objekt.top's own filter, which is backed by
// their full indexed catalog. The grid itself still only ever shows what's
// in the connected Cosmo account (§14 M4) — selecting a facet nothing
// owned matches just shows the empty state, same as any filter combination.
function refreshFilterOptions(): void {
  populateSelect(artistSelect, ALL_ARTISTS, artistDisplayName);
  populateMemberSelect();
  populateSelect(seasonSelect, [...new Set(Object.values(ARTIST_SEASONS).flat())]);
  populateSelect(classSelect, [...new Set(Object.values(ARTIST_CLASSES).flat())]);
}

for (const el of [searchInput, artistSelect, memberSelect, seasonSelect, classSelect, typeSelect, sortSelect]) {
  el.addEventListener('input', render);
}

columnsInput.addEventListener('input', () => {
  document.documentElement.style.setProperty('--columns', columnsInput.value);
});

selectAllButton.addEventListener('click', () => {
  for (const objekt of allObjekts.filter(matchesFilters)) selectedIds.add(objekt.id);
  persistSelection();
  render();
});

clearSelectionButton.addEventListener('click', () => {
  selectedIds.clear();
  persistSelection();
  render();
});

// Re-runs the same live fetch as the tray's "Refresh collection" — the only
// way to pick up something minted/traded since the account was connected or
// this window was opened, since reloadObjekts only otherwise runs on
// launch/reconnect (see state.ts).
refreshButton.addEventListener('click', () => {
  void (async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = t('collectionRefreshing', locale);
    try {
      allObjekts = await window.pulsar.refreshCollection();
      refreshFilterOptions();
      render();
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = t('collectionRefresh', locale);
    }
  })();
});

void (async () => {
  const [detectedLocale, objekts, settings] = await Promise.all([
    window.pulsar.getLocale(),
    window.pulsar.getObjektList(),
    window.pulsar.getSettings(),
  ]);
  locale = detectedLocale;
  applyStaticI18n();
  allObjekts = objekts;
  selectedIds = new Set(settings.objekts.selectedIds);
  refreshFilterOptions();
  render();
})();
