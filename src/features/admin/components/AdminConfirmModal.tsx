"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { FB, css } from "@/features/admin/theme";
import type { AdminConfirmState } from "@/features/admin/hooks/useAdminDashboard";

export function AdminConfirmModal({
  confirmModal,
  onClose,
  onError,
}: {
  confirmModal: AdminConfirmState | null;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  if (!confirmModal) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: FB.white,
          borderRadius: "14px",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          overflow: "hidden",
          border: `1px solid ${FB.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${FB.border}`,
            background: FB.redLight,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: FB.red,
            fontWeight: "700",
            fontSize: "15px",
          }}
        >
          <AlertTriangle size={18} />
          <span>{confirmModal.title}</span>
        </div>
        <div style={{ padding: "18px", fontSize: "14px", color: FB.textPrimary, lineHeight: 1.5 }}>
          {confirmModal.description}
        </div>
        <div
          style={{
            padding: "12px 18px",
            background: FB.bg,
            borderTop: `1px solid ${FB.border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <button type="button" onClick={onClose} style={css.btn("secondary")}>
            ยกเลิก
          </button>
          <button
            type="button"
            data-testid="admin-confirm-submit-btn"
            onClick={async () => {
              const fn = confirmModal.onConfirm;
              onClose();
              try {
                await fn();
              } catch (e: unknown) {
                onError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
              }
            }}
            style={{ ...css.btn("danger"), background: FB.red, color: "white", border: "none" }}
          >
            {confirmModal.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
