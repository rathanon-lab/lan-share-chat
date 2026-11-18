"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Ban, Clock, Edit3, Save, Search, ShieldOff, Trash2, Wand2, X } from "lucide-react";
import type { PresenceStatus } from "@/types/chat";
import { FB, PresenceBadge, css, formatAdminDate } from "@/features/admin/theme";
import { UserAvatar } from "@/components/UserAvatar";

export interface AdminDeviceItem {
  deviceId: string;
  name: string;
  avatarUrl?: string | null;
  os?: string | null;
  browser?: string | null;
  lastIp?: string | null;
  lastSeenAt?: number | null;
  mutedUntil?: number;
  isBanned?: number;
  banReason?: string;
}

export function AdminDevicesTab({
  devices,
  bannedIps = [],
  adminCallerIp = "",
  adminCallerDeviceId = "",
  presenceMap,
  inlineEditId,
  inlineEditValue,
  setInlineEditValue,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onGenerateAlias,
  onMuteDevice,
  onBanDevice,
  onUnbanIp,
  onDeleteDevice,
  onResetDevices,
}: {
  devices: AdminDeviceItem[];
  bannedIps?: Array<{ ip: string; reason: string; bannedAt: number }>;
  adminCallerIp?: string;
  adminCallerDeviceId?: string;
  presenceMap: Record<string, PresenceStatus>;
  inlineEditId: string | null;
  inlineEditValue: string;
  setInlineEditValue: (val: string) => void;
  onStartEdit: (deviceId: string, name: string) => void;
  onSaveEdit: (deviceId: string) => void;
  onCancelEdit: () => void;
  onGenerateAlias: (deviceId: string) => void;
  onMuteDevice?: (deviceId: string, name: string, minutes: number) => void;
  onBanDevice?: (deviceId: string, name: string, banned: boolean, banIpToo?: boolean) => void;
  onUnbanIp?: (ip: string) => void;
  onDeleteDevice: (deviceId: string, name: string) => void;
  onResetDevices: () => void;
}) {
  const [onlyActive, setOnlyActive] = useState(false);
  const [onlyRestricted, setOnlyRestricted] = useState(false);
  const [deviceQuery, setDeviceQuery] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const localDevId = typeof window !== "undefined" ? localStorage.getItem("deviceId") || "" : "";
  const activeAdminDevId = adminCallerDeviceId || localDevId;

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const bannedIpSet = useMemo(() => new Set(bannedIps.map((b) => b.ip)), [bannedIps]);
  const isSelfIpCurrentlyBanned = Boolean(adminCallerIp && bannedIpSet.has(adminCallerIp));

  const sortedDevices = useMemo(() => {
    const rank = (status?: PresenceStatus) => (status === "online" ? 0 : status === "idle" ? 1 : 2);
    const q = deviceQuery.trim().toLowerCase();
    return [...devices]
      .filter((d) => {
        const presence = presenceMap[d.deviceId];
        if (onlyActive && presence !== "online" && presence !== "idle") return false;
        const devBanned = Boolean(d.isBanned);
        const devIpBanned = Boolean(d.lastIp && bannedIpSet.has(d.lastIp));
        const devMuted = Boolean(d.mutedUntil && Number(d.mutedUntil) > nowMs);
        if (onlyRestricted && !devBanned && !devIpBanned && !devMuted) return false;
        if (!q) return true;
        return (
          String(d.name || "").toLowerCase().includes(q) ||
          String(d.deviceId || "").toLowerCase().includes(q) ||
          String(d.lastIp || "").toLowerCase().includes(q) ||
          String(d.os || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ra = rank(presenceMap[a.deviceId]);
        const rb = rank(presenceMap[b.deviceId]);
        if (ra !== rb) return ra - rb;
        return Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0);
      });
  }, [devices, presenceMap, onlyActive, onlyRestricted, deviceQuery, bannedIpSet, nowMs]);

  const activeCount = devices.filter((d) => {
    const s = presenceMap[d.deviceId];
    return s === "online" || s === "idle";
  }).length;

  return (
    <div>
      <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={css.badge(false)}>
            {devices.length} อุปกรณ์ ({activeCount} ออนไลน์)
          </span>
          <button
            type="button"
            onClick={() => setOnlyActive((v) => !v)}
            style={{
              ...css.btn("secondary"),
              padding: "5px 10px",
              fontSize: "12px",
              background: onlyActive ? FB.blueLight : FB.white,
              color: onlyActive ? FB.blue : FB.textSecondary,
              border: `1px solid ${onlyActive ? FB.blue : FB.border}`,
            }}
          >
            {onlyActive ? "แสดงทั้งหมด" : "เฉพาะที่ออนไลน์อยู่"}
          </button>
          <button
            type="button"
            data-testid="devices-filter-restricted-btn"
            onClick={() => setOnlyRestricted((v) => !v)}
            style={{
              ...css.btn("secondary"),
              padding: "5px 10px",
              fontSize: "12px",
              background: onlyRestricted ? "#FEF2F2" : FB.white,
              color: onlyRestricted ? FB.red : FB.textSecondary,
              border: `1px solid ${onlyRestricted ? "#FCA5A5" : FB.border}`,
            }}
          >
            {onlyRestricted ? "แสดงทุกสถานะ" : "เฉพาะที่ถูกจำกัด/แบน"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: "180px" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: FB.textMuted }} />
            <input
              style={{ ...css.input, paddingLeft: "30px", borderRadius: "20px", fontSize: "12px" }}
              placeholder="ค้นหาชื่อ / IP / OS..."
              value={deviceQuery}
              onChange={(e) => setDeviceQuery(e.target.value)}
            />
          </div>
          {devices.length > 0 && (
            <button onClick={onResetDevices} style={css.btn("danger")}>
              <Trash2 size={14} /> ล้างทั้งหมด
            </button>
          )}
        </div>
      </div>

      {isSelfIpCurrentlyBanned && adminCallerIp && onUnbanIp && (
        <div
          data-testid="self-ip-banned-warning"
          style={{
            ...css.card,
            background: "#FFFBEB",
            border: "2px solid #F59E0B",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#B45309" }}>
            ⚠️ IP เครื่องของคุณ ({adminCallerIp}) กำลังติดอยู่ในรายการแบน IP!
          </div>
          <button
            type="button"
            onClick={() => onUnbanIp(adminCallerIp)}
            style={{ ...css.btn("primary"), background: "#16A34A", fontSize: "12px" }}
          >
            <ShieldOff size={13} /> ปลดแบน IP เครื่องตัวเองทันที
          </button>
        </div>
      )}

      {bannedIps.length > 0 && (
        <div data-testid="banned-ips-card" style={{ ...css.card, borderLeft: `4px solid ${FB.red}`, background: "#FEF2F2", marginBottom: "14px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: FB.red, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Ban size={14} /> รายชื่อ IP ที่ถูกแบน ({bannedIps.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {bannedIps.map((b) => (
              <div
                key={b.ip}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  background: FB.white,
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #FECACA",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <span style={{ fontFamily: "monospace", fontWeight: "700", fontSize: "13px", color: FB.textPrimary }}>{b.ip}</span>
                  <span style={{ fontSize: "12px", color: FB.textSecondary, marginLeft: "8px" }}>{b.reason || "Banned by Admin"}</span>
                  <span style={{ fontSize: "11px", color: FB.textMuted, marginLeft: "8px" }}>{formatAdminDate(b.bannedAt)}</span>
                </div>
                {onUnbanIp && (
                  <button
                    type="button"
                    data-testid={`unban-ip-${b.ip}`}
                    onClick={() => onUnbanIp(b.ip)}
                    style={{ ...css.btn("secondary"), padding: "4px 10px", fontSize: "12px", color: FB.green, border: "1px solid #BBF7D0" }}
                  >
                    <ShieldOff size={13} /> ปลดแบน IP
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sortedDevices.map((d) => {
        const presence = presenceMap[d.deviceId];
        const isEditing = inlineEditId === d.deviceId;
        const isBanned = Boolean(d.isBanned);
        const isIpBanned = Boolean(d.lastIp && bannedIpSet.has(d.lastIp));
        const isAnyBanned = isBanned || isIpBanned;
        const isMuted = Boolean(d.mutedUntil && Number(d.mutedUntil) > nowMs);
        const isSelfAdminDevice = Boolean(activeAdminDevId && d.deviceId === activeAdminDevId);
        const avatarStatus = isIpBanned ? "ip_banned" : isBanned ? "banned" : isMuted ? "muted" : "active";

        const cardStyle: React.CSSProperties = {
          ...css.card,
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          position: "relative",
          overflow: "hidden",
          background: isAnyBanned ? "#FEF2F2" : isMuted ? "#FFFDF5" : isSelfAdminDevice ? "#F8FAFC" : FB.white,
          border: isIpBanned
            ? "2px solid #2563EB"
            : isBanned
              ? "1.5px solid #EF4444"
              : isMuted
                ? "1.5px solid #FDE68A"
                : isSelfAdminDevice
                  ? "1.5px solid #93C5FD"
                  : css.card.border,
          boxShadow: isIpBanned
            ? "inset 6px 0 0 #DC2626, inset 0 0 0 2px #EF4444"
            : css.card.boxShadow,
          paddingLeft: isIpBanned ? "24px" : isBanned || isMuted ? "18px" : css.card.padding,
        };

        return (
          <div
            key={d.deviceId}
            data-testid={`device-card-${d.deviceId}`}
            data-ban-kind={isIpBanned ? "ip" : isBanned ? "device" : isMuted ? "muted" : "active"}
            style={cardStyle}
          >
            {(isAnyBanned || isMuted) && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "6px",
                  background: isIpBanned ? "#2563EB" : isBanned ? "#EF4444" : "#F59E0B",
                }}
              />
            )}

            <div style={{ position: "relative", flexShrink: 0 }}>
              <UserAvatar src={d.avatarUrl} name={d.name} size={44} status={avatarStatus} />
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: presence === "online" ? FB.green : presence === "idle" ? FB.yellow : "#ccc",
                  border: "2px solid white",
                }}
                title={presence || "offline"}
              />
            </div>

            <div style={{ flex: 1, minWidth: "180px" }}>
              {isEditing ? (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    autoFocus
                    maxLength={24}
                    value={inlineEditValue}
                    onChange={(e) => setInlineEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSaveEdit(d.deviceId);
                      if (e.key === "Escape") onCancelEdit();
                    }}
                    onBlur={() => onSaveEdit(d.deviceId)}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: `1px solid ${FB.border}`,
                      fontSize: "15px",
                      fontWeight: "600",
                      color: FB.textPrimary,
                      background: FB.bg,
                      outline: "none",
                    }}
                  />
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); onSaveEdit(d.deviceId); }} style={{ ...css.btn("primary"), padding: "6px 10px" }}>
                    <Save size={14} />
                  </button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); onCancelEdit(); }} style={{ ...css.btn("secondary"), padding: "6px 10px" }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div
                    onDoubleClick={() => onStartEdit(d.deviceId, d.name)}
                    style={{ fontSize: "15px", fontWeight: "600", color: FB.textPrimary, cursor: "text", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", userSelect: "none" }}
                  >
                    {d.name}
                    <Edit3 size={12} style={{ color: FB.textMuted, opacity: 0.6 }} />
                    {isSelfAdminDevice && (
                      <span
                        data-testid={`self-admin-badge-${d.deviceId}`}
                        style={{
                          padding: "2px 8px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: "#DBEAFE",
                          color: "#1D4ED8",
                          border: "1px solid #93C5FD",
                        }}
                      >
                        🛡️ เครื่องของคุณ (Admin)
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", color: FB.textSecondary, fontFamily: "monospace" }}>{d.deviceId}</span>
                    <PresenceBadge status={presence} />
                    {d.os && (
                      <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: "600", background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE" }}>
                        {d.os}
                        {d.browser ? ` · ${d.browser}` : ""}
                      </span>
                    )}
                    {d.lastIp && <span style={{ fontSize: "11px", color: FB.textSecondary, fontFamily: "monospace" }}>{d.lastIp}</span>}
                    {d.lastSeenAt && <span style={{ fontSize: "11px", color: FB.textMuted }}>ล่าสุด {formatAdminDate(d.lastSeenAt)}</span>}
                    {isBanned && (
                      <span data-testid={`device-banned-badge-${d.deviceId}`} style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: "700", background: "#FEE2E2", color: "#DC2626", border: "1px solid #FECACA" }}>
                        🚫 ถูกแบนอุปกรณ์
                      </span>
                    )}
                    {isIpBanned && (
                      <span data-testid={`device-ip-banned-badge-${d.deviceId}`} style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: "700", background: "#EFF6FF", color: "#1D4ED8", border: "1.5px solid #3B82F6", boxShadow: "inset 0 0 0 1px #FCA5A5" }}>
                        🌐🚫 แบน IP: {d.lastIp}
                      </span>
                    )}
                    {isMuted && !isAnyBanned && (
                      <span data-testid={`device-muted-badge-${d.deviceId}`} style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: "700", background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A" }}>
                        ⏳ ถูก Mute ถึง {formatAdminDate(d.mutedUntil ?? 0)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {!isEditing && (
              <div style={{ display: "flex", gap: "6px", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={() => onStartEdit(d.deviceId, d.name)} style={css.btn("secondary")} title="แก้ไขชื่อเครื่อง">
                  <Edit3 size={14} />
                </button>
                <button type="button" onClick={() => onGenerateAlias(d.deviceId)} style={{ ...css.btn("secondary"), color: FB.blue }} title="สุ่มชื่อใหม่ให้เครื่องนี้">
                  <Wand2 size={14} /> สุ่มชื่อ
                </button>
                {onMuteDevice && !isSelfAdminDevice && (
                  <button
                    type="button"
                    data-testid={`mute-device-btn-${d.deviceId}`}
                    onClick={() => onMuteDevice(d.deviceId, d.name, isMuted ? 0 : 5)}
                    style={{
                      ...css.btn("secondary"),
                      color: isMuted ? FB.green : "#B45309",
                      background: isMuted ? "#F0FDF4" : "#FFFBEB",
                      border: `1px solid ${isMuted ? "#BBF7D0" : "#FDE68A"}`,
                      fontSize: "12px",
                    }}
                    title={isMuted ? "ปลด Mute ทันที" : "จำกัดการส่ง 5 นาที"}
                  >
                    <Clock size={13} /> {isMuted ? "ปลด Mute" : "Mute 5m"}
                  </button>
                )}
                {onBanDevice && (
                  isAnyBanned ? (
                    <button
                      type="button"
                      data-testid={`unban-device-btn-${d.deviceId}`}
                      onClick={() => {
                        if (isBanned) {
                          onBanDevice(d.deviceId, d.name, false, false);
                        } else if (d.lastIp && onUnbanIp) {
                          onUnbanIp(d.lastIp);
                        }
                      }}
                      style={{ ...css.btn("secondary"), color: FB.green, background: "#F0FDF4", border: "1px solid #BBF7D0", fontSize: "12px" }}
                      title={isIpBanned ? "ปลดแบนอุปกรณ์ และปลดแบน IP" : "ปลดแบนอุปกรณ์"}
                    >
                      <ShieldOff size={13} /> {isIpBanned ? "ปลดแบน (+IP)" : "ปลดแบน"}
                    </button>
                  ) : isSelfAdminDevice ? (
                    <span
                      data-testid={`self-ban-protected-${d.deviceId}`}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        background: "#EFF6FF",
                        color: "#1D4ED8",
                        border: "1px solid #BFDBFE",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                      title="ระบบป้องกันการกดแบนเครื่องและ IP ของ Admin เอง"
                    >
                      🛡️ ป้องกันการแบนตัวเอง
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid={`ban-device-btn-${d.deviceId}`}
                        onClick={() => onBanDevice(d.deviceId, d.name, true, false)}
                        style={{ ...css.btn("danger"), fontSize: "12px" }}
                        title="แบนอุปกรณ์นี้ (Chat + Upload + P2P)"
                      >
                        <Ban size={13} /> แบน
                      </button>
                      {d.lastIp && (
                        <button
                          type="button"
                          data-testid={`ban-device-ip-btn-${d.deviceId}`}
                          onClick={() => onBanDevice(d.deviceId, d.name, true, true)}
                          style={{ ...css.btn("danger"), background: "#DC2626", color: "white", border: "2px solid #2563EB", fontSize: "12px" }}
                          title="ระงับทั้งอุปกรณ์และ IP นี้"
                        >
                          <Ban size={13} /> แบน+IP
                        </button>
                      )}
                    </>
                  )
                )}
                <button
                  type="button"
                  data-testid={`delete-device-btn-${d.deviceId}`}
                  onClick={() => onDeleteDevice(d.deviceId, d.name)}
                  style={css.btn("danger")}
                  title="ลบประวัตินี้"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
