'use client';

import React from 'react';
import { Ban, UserX } from 'lucide-react';
import { ADMIN_DEFAULT_AVATAR_URL, DEFAULT_ADMIN_RING_COLOR, resolveFallbackAvatarForName } from '@/lib/avatars';
import type { SenderDeviceStatus } from '@/types/chat';

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  isAdmin?: boolean;
  adminRingColor?: string;
  status?: SenderDeviceStatus;
  className?: string;
  style?: React.CSSProperties;
}

export function UserAvatar({
  src,
  name,
  size = 36,
  isAdmin = false,
  adminRingColor = DEFAULT_ADMIN_RING_COLOR,
  status = 'active',
  className = '',
  style,
}: UserAvatarProps) {
  const isDeleted = !isAdmin && status === 'deleted';
  const isBanned = !isAdmin && (status === 'banned' || status === 'ip_banned');
  const resolvedSrc = src || (isAdmin ? ADMIN_DEFAULT_AVATAR_URL : resolveFallbackAvatarForName(name));
  const ringPx = Math.max(2, Math.round(size / 14));
  const badgeSize = Math.max(14, Math.round(size * 0.42));

  return (
    <div
      className={`relative inline-flex shrink-0 select-none ${className}`}
      style={{ width: `${size}px`, height: `${size}px`, ...style }}
    >
      <div
        className={`rounded-full overflow-hidden w-full h-full inline-flex items-center justify-center ${
          isDeleted ? 'bg-slate-200 text-slate-500' : 'bg-slate-100'
        }`}
        style={{
          boxSizing: 'border-box',
          border: isAdmin
            ? `${ringPx}px solid ${adminRingColor || DEFAULT_ADMIN_RING_COLOR}`
            : isBanned
              ? '2px solid #ef4444'
              : isDeleted
                ? '1.5px dashed #94a3b8'
                : '1px solid rgba(148,163,184,0.35)',
          boxShadow: isAdmin ? `0 0 0 2px rgba(255,255,255,0.9), 0 2px 8px ${adminRingColor}40` : undefined,
        }}
      >
        {isDeleted ? (
          <UserX size={Math.round(size * 0.5)} className="text-slate-500" />
        ) : (
          <img
            src={resolvedSrc}
            alt={name || 'Avatar'}
            draggable={false}
            className={isBanned ? 'opacity-75 grayscale-[35%]' : undefined}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
      </div>

      {isBanned && (
        <span
          title="อุปกรณ์นี้ถูกระงับการใช้งาน"
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-red-600 text-white border border-white flex items-center justify-center shadow-sm pointer-events-none"
          style={{ width: `${badgeSize}px`, height: `${badgeSize}px` }}
        >
          <Ban size={Math.max(9, Math.round(badgeSize * 0.65))} strokeWidth={2.5} />
        </span>
      )}
    </div>
  );
}
