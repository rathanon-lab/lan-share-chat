"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Globe, Loader2, Shield, User } from "lucide-react";
import { FB } from "@/features/admin/theme";
import { useLanguage } from "@/lib/i18n";

function getOrCreateAdminClientId(): string {
  if (typeof window === "undefined") return "server";
  let cid = sessionStorage.getItem("adminClientId");
  if (!cid) {
    cid = `adm_cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("adminClientId", cid);
  }
  return cid;
}

export function LoginScreen({
  onLogin,
  kickedReason,
  onClearKickedReason,
}: {
  onLogin: (token: string) => void;
  kickedReason?: string | null;
  onClearKickedReason?: () => void;
}) {
  const { isEn, toggleLang, tx } = useLanguage();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    if (onClearKickedReason) onClearKickedReason();
    try {
      const clientId = getOrCreateAdminClientId();
      const deviceId = typeof window !== "undefined" ? localStorage.getItem("deviceId") || "" : "";
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({ password, clientId, deviceId }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem("adminToken", data.token);
        sessionStorage.removeItem("adminKickedReason");
        localStorage.setItem("adminToken", data.token);
        onLogin(data.token);
      } else {
        setError(data.error || tx("รหัสผ่านไม่ถูกต้อง", "Invalid password"));
      }
    } catch {
      setError(tx("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", "Unable to connect to server"));
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: FB.bg,
        fontFamily: '"Inter", "Noto Sans Thai", -apple-system, BlinkMacSystemFont, sans-serif',
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: "16px", right: "16px" }}>
        <button
          type="button"
          data-testid="admin-login-lang-btn"
          onClick={toggleLang}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            borderRadius: "999px",
            border: `1px solid ${FB.border}`,
            background: FB.white,
            color: FB.textPrimary,
            fontSize: "13px",
            fontWeight: "700",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <Globe size={15} /> {isEn ? "EN" : "TH"}
        </button>
      </div>

      <div style={{ width: "100%", maxWidth: "400px", padding: "0 16px" }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: FB.blue,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
              boxShadow: "0 2px 8px rgba(24,119,242,0.3)",
            }}
          >
            <Shield size={28} color="white" />
          </div>
          <h1 style={{ color: FB.textPrimary, fontSize: "26px", fontWeight: "700", margin: 0 }}>
            {tx("ผู้ดูแลระบบ (Admin Panel)", "Admin Panel")}
          </h1>
          <p style={{ color: FB.textSecondary, margin: "4px 0 0", fontSize: "14px" }}>
            {tx("LAN Share Chat — เข้าใช้งานได้ทีละ 1 เครื่อง", "LAN Share Chat — Single Active Admin Session")}
          </p>
        </div>

        <div
          style={{
            background: FB.white,
            borderRadius: "12px",
            boxShadow: "0 2px 4px rgba(0,0,0,.08), 0 8px 16px rgba(0,0,0,.08)",
            padding: "24px",
          }}
        >
          {kickedReason && (
            <div
              data-testid="admin-kicked-banner"
              style={{
                background: FB.redLight,
                border: "1px solid rgba(250,56,62,0.35)",
                borderRadius: "8px",
                padding: "12px 14px",
                marginBottom: "14px",
                color: FB.red,
                fontSize: "13px",
                fontWeight: "600",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                lineHeight: 1.45,
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "1px" }} />
              <span>
                {tx(
                  "เซสชันผู้ดูแลระบบถูกตัดออกอัตโนมัติ เนื่องจากมีการเข้าสู่ระบบ Admin จากอุปกรณ์หรือหน้าต่างอื่น",
                  "Your Admin session was disconnected because another device or window logged into Admin."
                )}
              </span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div
              style={{
                marginBottom: "12px",
                border: `1px solid ${FB.border}`,
                borderRadius: "8px",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: FB.bg,
                color: FB.textSecondary,
                fontSize: "16px",
              }}
            >
              <User size={18} style={{ color: FB.textMuted }} />
              <span>admin</span>
            </div>

            <div style={{ marginBottom: "12px", position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tx("รหัสผ่านผู้ดูแลระบบ", "Admin Password")}
                autoFocus
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: `1px solid ${FB.border}`,
                  borderRadius: "8px",
                  padding: "13px 48px 13px 16px",
                  fontSize: "16px",
                  outline: "none",
                  color: FB.textPrimary,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: FB.textSecondary,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {error && (
              <div
                style={{
                  background: FB.redLight,
                  border: "1px solid rgba(250,56,62,0.2)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "12px",
                  color: FB.red,
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "13px",
                background: loading ? "#A0BDE7" : FB.blue,
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontSize: "17px",
                fontWeight: "700",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {loading ? <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /> : null}
              {loading ? tx("กำลังเข้าสู่ระบบ...", "Signing in...") : tx("เข้าสู่ระบบ", "Sign In")}
            </button>
          </form>

          <div
            style={{
              marginTop: "14px",
              paddingTop: "14px",
              borderTop: `1px solid ${FB.border}`,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Link
              href="/"
              data-testid="admin-login-back-home"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: FB.bg,
                border: `1px solid ${FB.border}`,
                color: FB.textPrimary,
                fontSize: "14px",
                fontWeight: "600",
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={16} /> {tx("กลับหน้าแชทหลัก", "Back to Main Chat")}
            </Link>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
