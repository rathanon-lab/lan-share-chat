export interface AnimalAvatarPreset {
  id: string;
  name: string;
  url: string;
}

export const ANIMAL_AVATAR_PRESETS: AnimalAvatarPreset[] = [
  { id: '01-penguin', name: 'นกเพนกวิน', url: '/avatars/01-penguin.webp' },
  { id: '02-seal', name: 'แมวน้ำ', url: '/avatars/02-seal.webp' },
  { id: '03-orca', name: 'วาฬเพชฌฆาต', url: '/avatars/03-orca.webp' },
  { id: '04-sugar-glider', name: 'กระรอกบิน', url: '/avatars/04-sugar-glider.webp' },
  { id: '05-tanuki', name: 'ทานูกิ', url: '/avatars/05-tanuki.webp' },
  { id: '06-panda', name: 'หมีแพนด้า', url: '/avatars/06-panda.webp' },
  { id: '07-sea-otter', name: 'นากทะเล', url: '/avatars/07-sea-otter.webp' },
  { id: '08-fox', name: 'จิ้งจอก', url: '/avatars/08-fox.webp' },
  { id: '09-shiba', name: 'ชิบะอินุ', url: '/avatars/09-shiba.webp' },
  { id: '10-orange-cat', name: 'แมวส้ม', url: '/avatars/10-orange-cat.webp' },
  { id: '11-bunny', name: 'กระต่าย', url: '/avatars/11-bunny.webp' },
  { id: '12-owl', name: 'นกฮูก', url: '/avatars/12-owl.webp' },
  { id: '13-sloth', name: 'สลอธ', url: '/avatars/13-sloth.webp' },
  { id: '14-raccoon', name: 'แรคคูน', url: '/avatars/14-raccoon.webp' },
  { id: '15-capybara', name: 'คาปิบาร่า', url: '/avatars/15-capybara.webp' },
  { id: '16-koala', name: 'โคอาล่า', url: '/avatars/16-koala.webp' },
  { id: '17-red-panda', name: 'แพนด้าแดง', url: '/avatars/17-red-panda.webp' },
  { id: '18-duck', name: 'เป็ดเหลือง', url: '/avatars/18-duck.webp' },
  { id: '19-frog', name: 'กบเขียว', url: '/avatars/19-frog.webp' },
  { id: '20-lion', name: 'สิงโต', url: '/avatars/20-lion.webp' },
];

export const ADMIN_DEFAULT_AVATAR_URL = '/avatars/admin-special.webp';
export const DEFAULT_ADMIN_RING_COLOR = '#ef4444';

export const ADMIN_RING_SWATCHES = [
  { label: 'แดง (ค่าเริ่มต้น)', color: '#ef4444' },
  { label: 'น้ำเงิน', color: '#2563eb' },
  { label: 'ม่วง', color: '#7c3aed' },
  { label: 'ทอง', color: '#eab308' },
  { label: 'เขียวมรกต', color: '#10b981' },
  { label: 'ส้ม', color: '#f97316' },
];

const PRESET_URL_SET = new Set(ANIMAL_AVATAR_PRESETS.map((p) => p.url));

export function isValidPresetAvatarUrl(url?: string | null): boolean {
  return Boolean(url && PRESET_URL_SET.has(url));
}

export function isValidCustomAvatarUrl(url?: string | null): boolean {
  return Boolean(url && /^\/api\/avatar\/[a-zA-Z0-9._-]+\.(webp|png|jpe?g)$/.test(url));
}

export function isValidUserAvatarUrl(url?: string | null): boolean {
  return isValidPresetAvatarUrl(url) || isValidCustomAvatarUrl(url);
}

export function normalizeHexColor(input?: string | null, fallback = DEFAULT_ADMIN_RING_COLOR): string {
  const val = String(input || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(val) ? val.toLowerCase() : fallback;
}

export function resolveFallbackAvatarForName(name?: string | null): string {
  const clean = String(name || '').trim();
  const direct = ANIMAL_AVATAR_PRESETS.find((p) => clean.startsWith(p.name));
  if (direct) return direct.url;
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return ANIMAL_AVATAR_PRESETS[hash % ANIMAL_AVATAR_PRESETS.length].url;
}
