"use client";

import React from "react";
import { Bell, CheckCircle2, MessageSquare, Trash2, X } from "lucide-react";
import { FB, css, formatAdminDate } from "@/features/admin/theme";

export interface AdminAlertItem {
  id: number;
  alertType: string;
  messageId?: number | null;
  sender?: string;
  deviceId?: string;
  previewText?: string;
  reason?: string;
  status: string;
  createdAt?: number;
}

export function AdminAlertsTab({
  alerts,
  pendingAlertCount,
  onResolveAlert,
  onResolveAllAlerts,
  onResetAlerts,
  onGoToChat,
}: {
  alerts: AdminAlertItem[];
  pendingAlertCount: number;
  onResolveAlert: (id: number, action: "approve_delete" | "reject" | "resolved") => void;
  onResolveAllAlerts?: () => void;
  onResetAlerts: () => void;
  onGoToChat: () => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <span style={css.badge(pendingAlertCount > 0)}>
          <Bell size={12} /> {pendingAlertCount} รายการรอดำเนินการ · ทั้งหมด {alerts.length}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {pendingAlertCount > 0 && onResolveAllAlerts && (
            <button
              type="button"
              data-testid="alerts-resolve-all-btn"
              onClick={onResolveAllAlerts}
              style={css.btn("primary")}
            >
              <CheckCircle2 size={15} /> ปิดงานค้างทั้งหมด ({pendingAlertCount})
            </button>
          )}
          {alerts.length > 0 && (
            <button onClick={onResetAlerts} style={css.btn("danger")}>
              <Trash2 size={15} /> ล้างประวัติแจ้งเตือน
            </button>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div style={{ ...css.card, textAlign: "center", padding: "48px", color: FB.textMuted }}>
          <Bell size={32} style={{ opacity: 0.3, marginBottom: "8px" }} />
          <p style={{ margin: 0 }}>ยังไม่มีการแท็ก @admin หรือคำขอลบข้อความ</p>
        </div>
      ) : (
        alerts.map((a) => {
          const isUrgent = a.alertType === "delete_request" || a.alertType === "security_spam";
          return (
            <div
              key={a.id}
              style={{
                ...css.card,
                borderLeft: `4px solid ${a.status === "pending" ? (isUrgent ? FB.red : FB.yellow) : FB.green}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "220px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: "700",
                        background: isUrgent ? FB.redLight : "#FFF8E1",
                        color: isUrgent ? FB.red : "#E65100",
                      }}
                    >
                      {a.alertType === "delete_request"
                        ? "คำขอลบข้อความ"
                        : a.alertType === "security_spam"
                          ? "🛡️ Anti-Spam / Flood"
                          : "แท็ก @admin"}
                    </span>
                    <span style={{ fontWeight: "700", fontSize: "14px", color: FB.textPrimary }}>{a.sender}</span>
                    <span style={{ fontSize: "12px", color: FB.textMuted, fontFamily: "monospace" }}>{a.deviceId}</span>
                    <span style={{ fontSize: "12px", color: FB.textMuted }}>{formatAdminDate(a.createdAt ?? "")}</span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "20px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: a.status === "pending" ? FB.blueLight : FB.bg,
                        color: a.status === "pending" ? FB.blue : FB.textSecondary,
                      }}
                    >
                      {a.status}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: FB.textPrimary,
                      background: FB.bg,
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: `1px solid ${FB.border}`,
                    }}
                  >
                    <div>{a.reason || "(ไม่มีหมายเหตุ)"}</div>
                    {a.previewText && (
                      <div style={{ marginTop: "4px", fontSize: "12px", color: FB.textSecondary }}>
                        ข้อความ: &ldquo;{a.previewText}&rdquo;
                      </div>
                    )}
                    {a.messageId ? (
                      <div style={{ color: FB.textMuted, marginTop: "2px", fontSize: "11px" }}>Message #{a.messageId}</div>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                  {a.status === "pending" && a.alertType === "delete_request" && (
                    <>
                      <button onClick={() => onResolveAlert(a.id, "approve_delete")} style={{ ...css.btn("primary"), background: FB.red }}>
                        <CheckCircle2 size={14} /> อนุมัติลบข้อความ
                      </button>
                      <button onClick={() => onResolveAlert(a.id, "reject")} style={css.btn("secondary")}>
                        <X size={14} /> ปฏิเสธ
                      </button>
                    </>
                  )}
                  {a.status === "pending" && a.alertType !== "delete_request" && (
                    <button onClick={() => onResolveAlert(a.id, "resolved")} style={css.btn("primary")}>
                      <CheckCircle2 size={14} /> รับทราบ
                    </button>
                  )}
                  <button onClick={onGoToChat} style={css.btn("secondary")}>
                    <MessageSquare size={14} /> ไปที่แชท
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
