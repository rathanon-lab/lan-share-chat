"use client";

import React from "react";
import type { PresenceStatus } from "@/types/chat";

export const FB = {
  blue: '#1877F2',
  blueDark: '#166FE5',
  blueLight: '#E7F3FF',
  bg: '#F0F2F5',
  white: '#FFFFFF',
  border: '#E4E6EB',
  textPrimary: '#050505',
  textSecondary: '#65676B',
  textMuted: '#B0B3B8',
  green: '#42B72A',
  red: '#FA383E',
  redLight: '#FFEBE9',
  yellow: '#F7B928',
  yellowLight: '#FFF8E1',
};

export const css = {
  container: {
    background: FB.bg,
    fontFamily: '"Inter", "Noto Sans Thai", -apple-system, BlinkMacSystemFont, sans-serif',
    color: FB.textPrimary,
  } as React.CSSProperties,
  sidebar: {
    width: '240px',
    background: FB.white,
    borderRight: `1px solid ${FB.border}`,
    padding: '8px 8px',
  } as React.CSSProperties,
  sidebarItem: (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    color: active ? FB.blue : FB.textPrimary,
    background: active ? FB.blueLight : 'transparent',
    fontWeight: active ? '600' : '400',
    fontSize: '15px',
    marginBottom: '2px',
    userSelect: 'none',
  }),
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    padding: '10px 16px',
    borderBottom: `1px solid ${FB.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexWrap: 'wrap',
    background: FB.white,
    flexShrink: 0,
  } as React.CSSProperties,
  content: { flex: 1, minHeight: 0, overflow: 'auto', padding: '14px' } as React.CSSProperties,
  card: {
    background: FB.white,
    border: `1px solid ${FB.border}`,
    borderRadius: '8px',
    padding: '14px',
    marginBottom: '10px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  } as React.CSSProperties,
  input: {
    background: FB.bg,
    border: `1px solid ${FB.border}`,
    borderRadius: '20px',
    padding: '8px 16px',
    color: FB.textPrimary,
    fontSize: '15px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  btn: (variant: 'primary' | 'secondary' | 'danger' | 'ghost'): React.CSSProperties => {
    const map = {
      primary: { background: FB.blue, color: 'white', border: 'none' },
      secondary: { background: FB.bg, color: FB.textPrimary, border: `1px solid ${FB.border}` },
      danger: { background: FB.redLight, color: FB.red, border: '1px solid rgba(250,56,62,0.2)' },
      ghost: { background: 'transparent', color: FB.textSecondary, border: 'none' },
    }[variant];
    return {
      padding: '7px 14px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      whiteSpace: 'nowrap',
      ...map,
    };
  },
  badge: (isAdmin: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '700',
    background: isAdmin ? FB.blueLight : FB.bg,
    color: isAdmin ? FB.blue : FB.textSecondary,
    border: `1px solid ${isAdmin ? 'rgba(24,119,242,0.2)' : FB.border}`,
  }),
};

export function formatAdminBytes(bytes: number): string {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function formatAdminDate(iso: string | number): string {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export function PresenceBadge({ status }: { status?: PresenceStatus }) {
  const s = status || 'offline';
  const map: Record<PresenceStatus, { label: string; color: string; bg: string }> = {
    online: { label: 'Online', color: '#42B72A', bg: '#F0FFF0' },
    idle: { label: 'Idle', color: '#F7B928', bg: '#FFF8E1' },
    offline: { label: 'Offline', color: '#B0B3B8', bg: '#F0F2F5' },
  };
  const cfg = map[s];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '600',
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}
