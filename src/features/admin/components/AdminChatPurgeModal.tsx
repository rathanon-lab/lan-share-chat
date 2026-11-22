"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Clock, Loader2, Search, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { FB, css, formatAdminDate } from "@/features/admin/theme";

export type PurgeModalMode = "time" | "users" | "bots";

interface SenderSummaryItem {
  deviceId: string;
  sender: string;
  messageCount: number;
  lastAt: number;
  isAdmin: boolean;
}

interface BotSuspectItem {
  deviceId: string;
  sender: string;
  messageCount: number;
  maxBurst5s: number;
  maxBurst60s: number;
  reasons: string[];
  firstSeenAt: number;
  lastSeenAt: number;
}

interface AdminChatPurgeModalProps {
  mode: PurgeModalMode;
  apiFetch: (url: string, opts?: RequestInit) => Promise<any>;
  notify: (text: string, type?: "success" | "error") => void;
  onPurgeSuccess: (deletedIds: number[]) => void;
  onClose: () => void;
}

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminChatPurgeModal({
  mode,
  apiFetch,
  notify,
  onPurgeSuccess,
  onClose,
}: AdminChatPurgeModalProps) {
  // Time-Range state
  const [startLocal, setStartLocal] = useState<string>(() => toDatetimeLocalValue(Date.now() - 30 * 60 * 1000));
  const [endLocal, setEndLocal] = useState<string>(() => toDatetimeLocalValue(Date.now() + 60 * 1000));
  const [excludeAdmin, setExcludeAdmin] = useState<boolean>(true);
  const [rangePreview, setRangePreview] = useState<{ count: number; sampleSenders: Array<{ deviceId: string; sender: string; count: number }> } | null>(null);

  // User/Group state
  const [senders, setSenders] = useState<SenderSummaryItem[]>([]);
  const [senderSearch, setSenderSearch] = useState("");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [limitUsersByTime, setLimitUsersByTime] = useState(false);

  // Smart Bot Suspects state
  const [botSuspects, setBotSuspects] = useState<BotSuspectItem[]>([]);
  const [totalBotMessages, setTotalBotMessages] = useState(0);
  const [totalNormalMessages, setTotalNormalMessages] = useState(0);
  const [selectedBotIds, setSelectedBotIds] = useState<Set<string>>(new Set());
  const [alsoBanBots, setAlsoBanBots] = useState(false);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const parsedStartMs = useMemo(() => {
    const t = Date.parse(startLocal);
    return Number.isFinite(t) ? t : undefined;
  }, [startLocal]);

  const parsedEndMs = useMemo(() => {
    const t = Date.parse(endLocal);
    return Number.isFinite(t) ? t + 59_999 : undefined;
  }, [endLocal]);

  const fetchRangePreview = useCallback(async () => {
    if (mode !== "time") return;
    if (!parsedStartMs && !parsedEndMs) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/messages/purge-range", {
        method: "POST",
        body: JSON.stringify({ startMs: parsedStartMs, endMs: parsedEndMs, excludeAdmin, dryRun: true }),
      });
      setRangePreview({
        count: Number(res?.count) || 0,
        sampleSenders: Array.isArray(res?.sampleSenders) ? res.sampleSenders : [],
      });
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "ตรวจสอบช่วงเวลาไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, excludeAdmin, mode, notify, parsedEndMs, parsedStartMs]);

  useEffect(() => {
    if (mode === "time") {
      const t = setTimeout(() => {
        fetchRangePreview();
      }, 200);
      return () => clearTimeout(t);
    }
  }, [mode, fetchRangePreview]);

  useEffect(() => {
    let active = true;
    if (mode === "users") {
      setLoading(true);
      apiFetch("/api/admin/messages/senders")
        .then((res) => {
          if (!active) return;
          const list: SenderSummaryItem[] = Array.isArray(res?.senders) ? res.senders : [];
          setSenders(list.filter((s) => !s.isAdmin));
        })
        .catch((e: unknown) => {
          if (active) notify(e instanceof Error ? e.message : "โหลดรายชื่อผู้ส่งไม่สำเร็จ", "error");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else if (mode === "bots") {
      setLoading(true);
      apiFetch("/api/admin/messages/bot-suspects")
        .then((res) => {
          if (!active) return;
          const list: BotSuspectItem[] = Array.isArray(res?.suspects) ? res.suspects : [];
          setBotSuspects(list);
          setTotalBotMessages(Number(res?.totalBotMessages) || 0);
          setTotalNormalMessages(Number(res?.totalNormalMessages) || 0);
          setSelectedBotIds(new Set(list.map((b) => b.deviceId)));
        })
        .catch((e: unknown) => {
          if (active) notify(e instanceof Error ? e.message : "วิเคราะห์บอทไม่สำเร็จ", "error");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [apiFetch, mode, notify]);

  const applyTimePreset = (minutesBack: number | "today") => {
    const now = Date.now();
    let start: number;
    if (minutesBack === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      start = d.getTime();
    } else {
      start = now - minutesBack * 60 * 1000;
    }
    setStartLocal(toDatetimeLocalValue(start));
    setEndLocal(toDatetimeLocalValue(now + 60_000));
  };

  const filteredSenders = useMemo(() => {
    const q = senderSearch.trim().toLowerCase();
    if (!q) return senders;
    return senders.filter((s) => s.sender.toLowerCase().includes(q) || s.deviceId.toLowerCase().includes(q));
  }, [senders, senderSearch]);

  const selectedUsersMsgTotal = useMemo(
    () => senders.filter((s) => selectedDeviceIds.has(s.deviceId)).reduce((acc, s) => acc + s.messageCount, 0),
    [senders, selectedDeviceIds]
  );

  const selectedBotsMsgTotal = useMemo(
    () => botSuspects.filter((b) => selectedBotIds.has(b.deviceId)).reduce((acc, b) => acc + b.messageCount, 0),
    [botSuspects, selectedBotIds]
  );

  async function handleConfirmPurge() {
    setSubmitting(true);
    try {
      if (mode === "time") {
        const res = await apiFetch("/api/admin/messages/purge-range", {
          method: "POST",
          body: JSON.stringify({ startMs: parsedStartMs, endMs: parsedEndMs, excludeAdmin, dryRun: false }),
        });
        const ids: number[] = Array.isArray(res?.deletedIds) ? res.deletedIds : [];
        notify(`ลบข้อความตามช่วงเวลาแล้ว ${ids.length} รายการ`);
        onPurgeSuccess(ids);
        onClose();
      } else if (mode === "users") {
        const idsList = Array.from(selectedDeviceIds);
        if (idsList.length === 0) return;
        const res = await apiFetch("/api/admin/messages/purge-range", {
          method: "POST",
          body: JSON.stringify({
            deviceIds: idsList,
            startMs: limitUsersByTime ? parsedStartMs : undefined,
            endMs: limitUsersByTime ? parsedEndMs : undefined,
            excludeAdmin: true,
            dryRun: false,
          }),
        });
        const ids: number[] = Array.isArray(res?.deletedIds) ? res.deletedIds : [];
        notify(`ลบข้อความของ ${idsList.length} ผู้ใช้แล้วทั้งหมด ${ids.length} รายการ`);
        onPurgeSuccess(ids);
        onClose();
      } else {
        const botIds = Array.from(selectedBotIds);
        if (botIds.length === 0) return;
        const res = await apiFetch("/api/admin/messages/purge-bots", {
          method: "POST",
          body: JSON.stringify({ deviceIds: botIds, alsoBan: alsoBanBots }),
        });
        const ids: number[] = Array.isArray(res?.deletedIds) ? res.deletedIds : [];
        notify(`กวาดข้อความบอท/สแปม ${botIds.length} เครื่อง (${ids.length} ข้อความ) เรียบร้อย · ข้อความคุยปกติยังอยู่ครบ`);
        onPurgeSuccess(ids);
        onClose();
      }
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "ลบข้อความไม่สำเร็จ", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid={`purge-modal-${mode}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(15,23,42,0.65)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "560px",
          maxHeight: "88vh",
          background: FB.white,
          borderRadius: "14px",
          border: `1px solid ${FB.border}`,
          boxShadow: "0 20px 48px rgba(0,0,0,0.28)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${FB.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F8FAFC" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "15px", color: FB.textPrimary }}>
            {mode === "time" && <Clock size={18} style={{ color: FB.blue }} />}
            {mode === "users" && <Users size={18} style={{ color: "#7C3AED" }} />}
            {mode === "bots" && <Bot size={18} style={{ color: FB.red }} />}
            <span>
              {mode === "time"
                ? "ลบข้อความตามช่วงเวลา (Time-Range Purge)"
                : mode === "users"
                  ? "ลบข้อความเฉพาะผู้ใช้ / กลุ่มผู้ใช้"
                  : "กวาดเฉพาะบอท/สแปมอัตโนมัติ (เก็บข้อความปกติไว้ครบ)"}
            </span>
          </div>
          <button type="button" onClick={onClose} style={{ ...css.btn("ghost"), padding: "4px" }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          {mode === "time" && (
            <>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => applyTimePreset(15)} style={{ ...css.btn("secondary"), fontSize: "12px", padding: "5px 10px" }}>
                  15 นาทีล่าสุด
                </button>
                <button type="button" onClick={() => applyTimePreset(60)} style={{ ...css.btn("secondary"), fontSize: "12px", padding: "5px 10px" }}>
                  1 ชั่วโมงล่าสุด
                </button>
                <button type="button" onClick={() => applyTimePreset("today")} style={{ ...css.btn("secondary"), fontSize: "12px", padding: "5px 10px" }}>
                  วันนี้ทั้งหมด
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: FB.textSecondary, display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span>ตั้งแต่ (วัน / เวลา)</span>
                  <input
                    type="datetime-local"
                    data-testid="purge-time-start"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    style={{ ...css.input, fontSize: "13px" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: FB.textSecondary, display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span>ถึง (วัน / เวลา)</span>
                  <input
                    type="datetime-local"
                    data-testid="purge-time-end"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    style={{ ...css.input, fontSize: "13px" }}
                  />
                </label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: FB.textPrimary, cursor: "pointer" }}>
                <input type="checkbox" checked={excludeAdmin} onChange={(e) => setExcludeAdmin(e.target.checked)} style={{ accentColor: FB.blue }} />
                <span>ยกเว้นข้อความของ Admin (ไม่ลบประกาศจาก Admin)</span>
              </label>

              <div style={{ padding: "12px", borderRadius: "10px", background: "#FEF2F2", border: "1px solid #FECACA", fontSize: "13px" }}>
                {loading ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: FB.textSecondary }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> กำลังคำนวณจำนวนข้อความ...
                  </span>
                ) : (
                  <>
                    <div data-testid="purge-time-preview-count" style={{ fontWeight: "700", color: FB.red }}>
                      พบ {rangePreview?.count ?? 0} ข้อความในช่วงเวลานี้
                    </div>
                    {rangePreview && rangePreview.sampleSenders.length > 0 && (
                      <div style={{ fontSize: "11px", color: FB.textSecondary, marginTop: "6px", lineHeight: 1.5 }}>
                        ผู้ส่งหลัก:{" "}
                        {rangePreview.sampleSenders
                          .slice(0, 6)
                          .map((s) => `${s.sender} (${s.count})`)
                          .join(", ")}
                        {rangePreview.sampleSenders.length > 6 ? ` และอีก ${rangePreview.sampleSenders.length - 6} เครื่อง` : ""}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {mode === "users" && (
            <>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: FB.textMuted }} />
                <input
                  value={senderSearch}
                  onChange={(e) => setSenderSearch(e.target.value)}
                  placeholder="ค้นหาชื่อผู้ใช้หรือ Device ID..."
                  style={{ ...css.input, paddingLeft: "32px", fontSize: "13px" }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: FB.textSecondary, cursor: "pointer" }}>
                <input type="checkbox" checked={limitUsersByTime} onChange={(e) => setLimitUsersByTime(e.target.checked)} style={{ accentColor: FB.blue }} />
                <span>จำกัดเฉพาะช่วงเวลาที่กำหนดด้วย</span>
              </label>

              {limitUsersByTime && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} style={{ ...css.input, fontSize: "12px" }} />
                  <input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} style={{ ...css.input, fontSize: "12px" }} />
                </div>
              )}

              <div style={{ border: `1px solid ${FB.border}`, borderRadius: "10px", maxHeight: "260px", overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: "24px", textAlign: "center", color: FB.textMuted, fontSize: "13px" }}>กำลังโหลดรายชื่อผู้ส่ง...</div>
                ) : filteredSenders.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: FB.textMuted, fontSize: "13px" }}>ไม่พบผู้ส่งข้อความ</div>
                ) : (
                  filteredSenders.map((s) => {
                    const checked = selectedDeviceIds.has(s.deviceId);
                    return (
                      <label
                        key={s.deviceId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          padding: "8px 12px",
                          borderBottom: `1px solid ${FB.border}`,
                          background: checked ? "#F5F3FF" : FB.white,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedDeviceIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.deviceId)) next.delete(s.deviceId);
                                else next.add(s.deviceId);
                                return next;
                              })
                            }
                            style={{ accentColor: "#7C3AED" }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: "700", color: FB.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.sender}
                            </div>
                            <div style={{ fontSize: "11px", color: FB.textMuted, fontFamily: "monospace" }}>
                              {s.deviceId} · ล่าสุด {formatAdminDate(s.lastAt)}
                            </div>
                          </div>
                        </div>
                        <span style={{ ...css.badge(false), flexShrink: 0 }}>{s.messageCount} ข้อความ</span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          )}

          {mode === "bots" && (
            <>
              <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#ECFDF5", border: "1px solid #A7F3D0", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#065F46" }}>
                <ShieldCheck size={18} style={{ flexShrink: 0 }} />
                <div>
                  <strong>ระบบแยกบอทออกจากคนจริง:</strong> จะลบเฉพาะข้อความของเครื่องที่เข้าข่ายบอท/สแปม (เลือกไว้ <strong>{selectedBotsMsgTotal}</strong> ข้อความ) ส่วนข้อความคุยปกติ (<strong>{totalNormalMessages}</strong> ข้อความ) จะยังคงอยู่ครบ
                </div>
              </div>

              <div style={{ border: `1px solid ${FB.border}`, borderRadius: "10px", maxHeight: "260px", overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: "24px", textAlign: "center", color: FB.textMuted, fontSize: "13px" }}>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite", display: "inline", marginRight: 6 }} />
                    กำลังสแกนพฤติกรรมบอทและสแปม...
                  </div>
                ) : botSuspects.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: FB.textMuted, fontSize: "13px" }}>
                    ไม่พบอุปกรณ์ที่มีพฤติกรรมบอทหรือสแปมในช่วง 72 ชม. ล่าสุด
                  </div>
                ) : (
                  botSuspects.map((b) => {
                    const checked = selectedBotIds.has(b.deviceId);
                    return (
                      <label
                        key={b.deviceId}
                        data-testid={`bot-suspect-row-${b.deviceId}`}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "10px",
                          padding: "8px 12px",
                          borderBottom: `1px solid ${FB.border}`,
                          background: checked ? "#FEF2F2" : FB.white,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedBotIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(b.deviceId)) next.delete(b.deviceId);
                                else next.add(b.deviceId);
                                return next;
                              })
                            }
                            style={{ marginTop: "3px", accentColor: FB.red }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: "700", color: FB.textPrimary }}>
                              {b.sender} <span style={{ fontSize: "11px", fontWeight: "500", color: FB.textMuted, fontFamily: "monospace" }}>({b.deviceId})</span>
                            </div>
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "3px" }}>
                              {b.reasons.map((r, i) => (
                                <span key={i} style={{ fontSize: "10px", fontWeight: "700", padding: "1px 6px", borderRadius: "999px", background: "#FEE2E2", color: "#B91C1C" }}>
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <span style={{ ...css.badge(true), flexShrink: 0 }}>{b.messageCount} ข้อความ</span>
                      </label>
                    );
                  })
                )}
              </div>

              {botSuspects.length > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: FB.textPrimary, cursor: "pointer" }}>
                  <input type="checkbox" checked={alsoBanBots} onChange={(e) => setAlsoBanBots(e.target.checked)} style={{ accentColor: FB.red }} />
                  <span>สั่งแบนอุปกรณ์บอทที่เลือกทั้งหมดพร้อมกัน (กันยิงซ้ำ)</span>
                </label>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${FB.border}`, display: "flex", justifyContent: "flex-end", gap: "8px", background: "#F8FAFC" }}>
          <button type="button" onClick={onClose} style={css.btn("secondary")}>
            ยกเลิก
          </button>
          <button
            type="button"
            data-testid="purge-modal-confirm-btn"
            disabled={
              submitting ||
              loading ||
              (mode === "time" && (!rangePreview || rangePreview.count === 0)) ||
              (mode === "users" && selectedDeviceIds.size === 0) ||
              (mode === "bots" && selectedBotIds.size === 0)
            }
            onClick={handleConfirmPurge}
            style={{
              ...css.btn("danger"),
              background: FB.red,
              color: "white",
              border: "none",
              opacity: submitting ? 0.65 : 1,
            }}
          >
            <Trash2 size={14} />
            {submitting
              ? "กำลังลบ..."
              : mode === "time"
                ? `ยืนยันลบ ${rangePreview?.count ?? 0} ข้อความ`
                : mode === "users"
                  ? `ลบ ${selectedDeviceIds.size} ผู้ใช้ (~${selectedUsersMsgTotal} ข้อความ)`
                  : `กวาดเฉพาะบอท ${selectedBotIds.size} เครื่อง (${selectedBotsMsgTotal} ข้อความ)`}
          </button>
        </div>
      </div>
    </div>
  );
}
