export interface ParsedDevicePlatform {
  os: string;
  browser: string;
  summary: string;
}

/**
 * Parses User-Agent + optional client-reported platform hint (e.g. iPadOS desktop-mode touch check or UA-CH platform)
 * into clean standardized OS and Browser labels for Admin device inventory & audit logs.
 */
export function parseDevicePlatform(userAgent?: string | null, clientHint?: string | null): ParsedDevicePlatform {
  const ua = String(userAgent || '').trim();
  const hint = String(clientHint || '').trim();

  let os = 'Unknown';
  if (/iPad/i.test(ua) || hint === 'iPadOS') {
    os = 'iPadOS';
  } else if (/iPhone|iPod/i.test(ua) || hint === 'iOS') {
    os = 'iOS';
  } else if (/Android/i.test(ua) || hint === 'Android') {
    os = 'Android';
  } else if (/Windows NT/i.test(ua) || /Windows/i.test(hint)) {
    os = 'Windows';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/Macintosh|Mac OS X/i.test(ua) || /macOS/i.test(hint)) {
    os = 'macOS';
  } else if (/Linux/i.test(ua) || /Linux/i.test(hint)) {
    os = 'Linux';
  }

  let browser = 'Browser';
  if (/EdgA?|EdgiOS/i.test(ua)) {
    browser = 'Edge';
  } else if (/CriOS|Chrome/i.test(ua) && !/Edg/i.test(ua)) {
    browser = 'Chrome';
  } else if (/FxiOS|Firefox/i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) {
    browser = 'Safari';
  } else if (/Playwright|HeadlessChrome/i.test(ua)) {
    browser = 'Automated';
  }

  return {
    os,
    browser,
    summary: `${os} · ${browser}`,
  };
}

/**
 * Formats internal OS identifier into a concise user-facing device badge label
 * shown in the online peers list and beside chat sender names.
 */
export function formatDeviceBadge(os?: string | null): string {
  const val = String(os || '').trim();
  if (!val || val === 'Unknown') return '';
  if (val === 'iPadOS') return 'iPad';
  if (val === 'iOS') return 'iPhone';
  return val;
}
