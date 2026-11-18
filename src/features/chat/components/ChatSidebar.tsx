"use client";

import { Edit2, FileUp, Monitor, Share2 } from "lucide-react";
import type { PeerInfo } from "@/types/chat";
import { UserAvatar } from "@/components/UserAvatar";
import { formatDeviceBadge } from "@/lib/deviceMeta";

interface ChatSidebarProps {
  activeMobileTab: 'chat' | 'peers';
  identity: {
    deviceId: string;
    name: string;
    ip: string;
    avatarUrl?: string;
    os?: string;
    browser?: string;
  };
  otherPeers: PeerInfo[];
  onOpenProfileModal: () => void;
  onOpenDirectSendModal: (peer: PeerInfo) => void;
  isRestricted?: boolean;
  isDark?: boolean;
}

export function ChatSidebar({
  activeMobileTab,
  identity,
  otherPeers,
  onOpenProfileModal,
  onOpenDirectSendModal,
  isRestricted = false,
  isDark = false,
}: ChatSidebarProps) {
  return (
    <div
      className={`md:flex w-full md:w-80 border-r flex-col shadow-sm z-10 shrink-0 min-h-0 flex-1 md:flex-none md:h-full ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-gray-200'
      } ${activeMobileTab === 'peers' ? 'flex' : 'hidden md:flex'}`}
    >
      <div className={`p-4 md:p-5 border-b flex items-center gap-3 shrink-0 ${isDark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'}`}>
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shrink-0">
          <Share2 size={20} />
        </div>
        <div>
          <h1 className={`font-bold text-lg leading-tight ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>LAN Share</h1>
          <p className={`text-xs font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Direct P2P Transfer</p>
        </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden min-h-0 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
        <div
          className={`p-4 md:p-5 pb-3 shrink-0 border-b shadow-[0_4px_6px_-6px_rgba(0,0,0,0.1)] z-10 ${
            isDark ? 'border-slate-800 bg-slate-900' : 'border-gray-100 bg-white'
          }`}
        >
          <div
            className={`border p-3.5 md:p-4 rounded-2xl mb-4 shadow-sm ${
              isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-blue-50/50 border-blue-100'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className={`text-xs font-bold tracking-wider uppercase ${isDark ? 'text-blue-400' : 'text-blue-500'}`}>
                ข้อมูลของฉัน
              </span>
              <button
                type="button"
                data-testid="edit-profile-btn"
                onClick={onOpenProfileModal}
                className={`transition-colors px-2 py-1 rounded-md shadow-sm border inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${
                  isDark
                    ? 'bg-slate-900 text-blue-300 hover:text-white border-slate-700'
                    : 'bg-white text-blue-600 hover:text-blue-800 border-blue-100'
                }`}
                title="แก้ไขชื่อและอวตาร"
              >
                <Edit2 size={12} /> โปรไฟล์
              </button>
            </div>
            <div className="flex items-center gap-3">
              <UserAvatar src={identity.avatarUrl} name={identity.name} size={44} />
              <div className="min-w-0 flex-1">
                <div className={`font-semibold truncate ${isDark ? 'text-slate-100' : 'text-gray-900'}`} data-testid="sidebar-identity-name">
                  {identity.name}
                </div>
                <div className={`text-xs mt-0.5 flex items-center gap-1.5 flex-wrap ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                  <Monitor size={12} />
                  <span>{identity.ip}</span>
                  {formatDeviceBadge(identity.os) && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        isDark ? 'bg-blue-950/70 text-blue-300 border border-blue-800' : 'bg-blue-100/70 text-blue-700'
                      }`}
                    >
                      {formatDeviceBadge(identity.os)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-1 px-1">
            <h2 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              เครื่องที่ออนไลน์
            </h2>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                isDark ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'bg-green-100 text-green-700'
              }`}
            >
              {otherPeers.length}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-5 pt-3 pb-4 space-y-2">
          {otherPeers.length === 0 && (
            <p className={`text-sm text-center mt-6 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              No other peers on this network.
            </p>
          )}
          {otherPeers.map((peer) => (
            <div
              key={peer.id}
              className={`flex items-center justify-between p-3 rounded-xl border border-transparent transition-all group ${
                isDark ? 'hover:bg-slate-800/70 hover:border-slate-700' : 'hover:bg-gray-50 hover:border-gray-100'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <UserAvatar src={peer.avatarUrl} name={peer.name} size={40} />
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 rounded-full ${
                      isDark ? 'border-slate-900' : 'border-white'
                    }`}
                  ></div>
                </div>
                <div className="overflow-hidden">
                  <div className={`font-semibold text-sm flex items-center gap-2 truncate ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                    {peer.name}
                    {(peer.tabCount ?? 1) > 1 && (
                      <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                        {peer.tabCount} Tabs
                      </span>
                    )}
                  </div>
                  <div className={`text-xs flex flex-col items-start gap-1 mt-0.5 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                    <span className="truncate max-w-full">{peer.ip}</span>
                    {formatDeviceBadge(peer.os) && (
                      <span
                        data-testid={`peer-os-badge-${peer.deviceId || peer.id}`}
                        className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border shrink-0 ${
                          isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {formatDeviceBadge(peer.os)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={isRestricted}
                onClick={() => onOpenDirectSendModal(peer)}
                title={isRestricted ? "ถูกจำกัดการส่งชั่วคราว" : "ส่งไฟล์แบบ P2P Direct"}
                className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold shrink-0 ${
                  isRestricted
                    ? isDark
                      ? 'text-slate-500 bg-slate-800 cursor-not-allowed'
                      : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                    : isDark
                      ? 'text-blue-300 hover:bg-blue-900/60 bg-blue-950/70 border border-blue-800 cursor-pointer'
                      : 'text-blue-600 hover:bg-blue-100 bg-blue-50 cursor-pointer'
                }`}
              >
                <FileUp size={14} /> Send
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
