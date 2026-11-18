"use client";

import { useEffect } from "react";
import type { AppLang } from "./i18n";

const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;
const ANIMAL_NICKNAME_RE = /^[ก-๙a-zA-Z0-9]+_\d{3}$/;

import { EXACT_PHRASE_MAP } from './i18nPhrases';

const REGEX_RULES: Array<[RegExp, (...m: string[]) => string]> = [
  [/^(\d+)\s*รายการรอดำเนินการ\s*·\s*ทั้งหมด\s*(\d+)$/, (_, p, t) => `${p} Pending · Total ${t}`],
  [/^(\d+)\s*อุปกรณ์\s*\((\d+)\s*ออนไลน์\)$/, (_, d, o) => `${d} Devices (${o} Online)`],
  [/^(\d+)\s*ไฟล์\s*·\s*รวม\s*(.+)$/, (_, c, sz) => `${c} Files · Total ${sz}`],
  [/^(\d+)\s*\/\s*(\d+)\s*รายการ\s*\(เก็บ\s*(\d+)\s*วัน\)$/, (_, a, b, d) => `${a} / ${b} entries (${d}-day retention)`],
  [/^(\d+)\s*ข้อความ$/, (_, c) => `${c} messages`],
  [/^(\d+)\s*เครื่อง$/, (_, c) => `${c} devices`],
  [/^(\d+)\s*ตัว$/, (_, c) => `${c} stickers`],
  [/^ทั้งหมด\s*(\d+)\s*ชุดในระบบ$/, (_, c) => `${c} sticker packs in system`],
  [/^ทั้งหมด\s*(\d+)\s*\/\s*(\d+)\s*ตัว\s*\(ขั้นต่ำ\s*(\d+)\s*ตัว\)$/, (_, a, b, m) => `Total ${a} / ${b} stickers (min ${m})`],
  [/^เลือกหลายไฟล์\s*\((\d+)-(\d+)\s*รูป\)$/, (_, a, b) => `Select Images (${a}-${b})`],
  [/^คลังอวตารสัตว์\s*\((\d+)\s*แบบ\)$/, (_, c) => `Animal Avatar Presets (${c})`],
  [/^ทั้งหมด\s*\((\d+)\)$/, (_, c) => `All (${c})`],
  [/^รูปภาพ\s*\((\d+)\)$/, (_, c) => `Images (${c})`],
  [/^วิดีโอ\s*\((\d+)\)$/, (_, c) => `Videos (${c})`],
  [/^เสียง\s*\((\d+)\)$/, (_, c) => `Audio (${c})`],
  [/^เอกสาร\/อื่น\s*ๆ\s*\((\d+)\)$/, (_, c) => `Docs / Other (${c})`],
  [/^รูป\/วิดีโอ\s*\((\d+)\)$/, (_, c) => `Photos/Videos (${c})`],
  [/^เสียง\/เอกสาร\s*\((\d+)\)$/, (_, c) => `Audio/Docs (${c})`],
  [/^เลือกทั้งหมวด\s*\((\d+)\)$/, (_, c) => `Select Category (${c})`],
  [/^เลือกทั้งหมด\s*\((\d+)\)$/, (_, c) => `Select All (${c})`],
  [/^ลบที่เลือก\s*\((\d+)(?:\s*ข้อความ)?\)$/, (_, c) => `Delete Selected (${c})`],
  [/^ลบชุดที่เลือก\s*\((\d+)\)$/, (_, c) => `Delete Selected (${c})`],
  [/^ล้าง\s*\((\d+)\)$/, (_, c) => `Clear (${c})`],
  [/^ส่ง\s*\((\d+)\)$/, (_, c) => `Send (${c})`],
  [/^โหลด\s*\.ZIP\s*\((\d+)\)$/i, (_, c) => `Download .ZIP (${c})`],
  [/^โหลดทั้งหมดเป็น\s*\.ZIP\s*\((\d+)\)$/i, (_, c) => `Download All as .ZIP (${c})`],
  [/^โหลดทีละไฟล์ทั้งหมด\s*\((\d+)\)$/, (_, c) => `Download All Individually (${c})`],
  [/^โหลดหลายไฟล์\s*\((\d+)\)$/, (_, c) => `Download Multiple (${c})`],
  [/^รายการไฟล์และสื่อทั้งหมด\s*\((\d+)\s*รายการ\)$/, (_, c) => `All Media & Files (${c} items)`],
  [/^อัลบั้มสื่อ\s*\((\d+)\s*รายการ\)$/, (_, c) => `Media Album (${c} items)`],
  [/^ไฟล์ทั้งหมด\s*(\d+)\s*รายการ\s*\(ซ่อนอยู่\s*(\d+)\s*ไฟล์\)$/, (_, t, h) => `${t} files total (${h} more hidden)`],
  [/^แก้ไขแล้ว\s*\((\d+)\)$/, (_, c) => `Edited (${c})`],
  [/^ดูประวัติการแก้ไข\s*\((\d+)\)$/, (_, c) => `Edit History (${c})`],
  [/^ลบโดยผู้ใช้\s*\((.+)\)$/, (_, u) => `Deleted by user (${u})`],
  [/^ข้อความนี้ถูกลบโดย\s*(.+)$/, (_, u) => `Message deleted by ${u}`],
  [/^รอส่ง\s*(\d+)\/(\d+)\s*ไฟล์$/, (_, a, b) => `Staged ${a}/${b} files`],
  [/^ไฟล์ที่เลือก\s*\((\d+)\/(\d+)\)$/, (_, a, b) => `Selected Files (${a}/${b})`],
  [/^ระบบระงับสิทธิ์อัตโนมัติ\s*(\d+)\s*นาที$/, (_, m) => `Auto-muted by system for ${m} minutes`],
  [/^ส่งข้อความถี่เกิน\s*(\d+)\s*ครั้ง\/(\d+)\s*วิ$/, (_, c, s) => `Message rate exceeded (> ${c} msgs / ${s}s)`],
  [/^ส่งข้อความหรือสติกเกอร์ซ้ำรัวเกิน\s*(\d+)\s*ครั้ง\s*\(Auto-Spam\)$/, (_, c) => `Duplicate message/sticker flood (> ${c}x)`],
  [/^ข้อความ:\s*[“"](.+)[”"]$/, (_, txt) => `Message: "${translateUiTextToEn(txt)}"`],
  [/^เริ่มทำงาน:\s*(.+)$/, (_, d) => `Started: ${d}`],
  [/^ล่าสุด\s+(.+)$/, (_, d) => `Last seen ${d}`],
  [/^🌐🚫\s*แบน IP:\s*(.+)$/, (_, ip) => `🌐🚫 IP Banned: ${ip}`],
  [/^⏳\s*ถูก Mute ถึง\s*(.+)$/, (_, d) => `⏳ Muted until ${d}`],
  [/^รายชื่อ IP ที่ถูกแบน\s*\((\d+)\)$/, (_, c) => `Banned IP Addresses (${c})`],
  [/^สถิติผู้ใช้งานรายชั่วโมงวันนี้\s*\((.+)\)$/, (_, d) => `Hourly Active Users Today (${d})`],
  [/^Peak วันนี้:\s*(\d+)\s*เครื่อง$/, (_, c) => `Today's Peak: ${c} devices`],
  [/^บันทึกทั้งหมด\s*(\d+)\s*เครื่อง\s*·\s*(\d+)\s*ไฟล์\s*\((.+)\)$/, (_, d, f, sz) => `Total ${d} devices · ${f} files (${sz})`],
  [/^กันสแปม\/Flood วันนี้:\s*(\d+)\s*ครั้ง\s*·\s*ข้อความสะสม\s*(\d+)$/, (_, b, m) => `Spam blocked today: ${b} · Total messages: ${m}`],
  [/^พบค่าว่าง\s*\/\s*ยังไม่ติดตั้ง\s*(\d+)\s*รายการ$/, (_, c) => `${c} missing / unconfigured items`],
  [/^ส่งโดยตรง \(P2P\) ไปที่\s*(.+)$/, (_, n) => `Direct P2P Transfer to ${n}`],
  [/^กำลังส่งไปยัง\s*(.+)$/, (_, n) => `Sending to ${n}`],
  [/^รับไฟล์จาก\s*(.+)\s*เรียบร้อยแล้ว\s*\((.+)\)$/, (_, n, t) => `Received files from ${n} (${t})`],
  [/^รับไฟล์จาก\s*(.+)$/, (_, n) => `Receive Files from ${n}`],
  [/^รับจาก\s*(.+)$/, (_, n) => `Receiving from ${n}`],
  [/^(.+)\s*ต้องการส่งไฟล์ให้คุณ$/, (_, n) => `${n} wants to send you files`],
  [/^จำนวน\s*(\d+)\s*ไฟล์\s*·\s*ขนาดรวม\s*(.+)$/, (_, c, sz) => `${c} files · Total size ${sz}`],
  [/^หน้า\s*(\d+)\s*\/\s*(\d+)$/, (_, a, b) => `Page ${a} / ${b}`],
];

const SUBSTRING_MAP: Array<[string, string]> = [
  ["หน้านี้แสดงสถานะการตั้งค่าสภาพแวดล้อมจริงของเซิร์ฟเวอร์เพื่อตรวจสอบความพร้อม (ไม่สามารถแก้ไขผ่านหน้าเว็บได้", "Read-only view of live server environment & tools (cannot be edited from the web UI."],
  ["หากต้องการปรับปรุงค่าใน", "To update"],
  ["หรือติดตั้ง FFmpeg ให้ปิดเซิร์ฟเวอร์ แก้ไขไฟล์", "or install FFmpeg, stop the server, edit"],
  ["แล้วเปิดเซิร์ฟเวอร์ใหม่)", "and restart the server)."],
  ["สำหรับ Windows: ติดตั้ง FFmpeg แล้วเพิ่มใน System PATH หรือกำหนด FFMPEG_PATH=... ในไฟล์ .env จากนั้นรีสตาร์ตเซิร์ฟเวอร์ (Linux Docker ติดตั้งใน Dockerfile ให้แล้ว)", "Windows: Install FFmpeg and add to System PATH or set FFMPEG_PATH in .env, then restart (pre-installed in Linux Docker)"],
  ["พร้อมแปลงพรีวิว H.265/HEVC -> H.264 อัตโนมัติ (คงไฟล์ต้นฉบับไว้เหมือนเดิม)", "Ready for automatic H.265/HEVC -> H.264 preview transcoding (original file preserved)"],
  ["แนะนำให้กำหนด ADMIN_PASSWORD ในไฟล์ .env ก่อนใช้งานจริง", "Recommended to set ADMIN_PASSWORD in .env for production"],
  ["ตั้งค่าใน .env แล้ว", "Configured in .env"],
  ["Token เข้ารหัสถาวรข้ามการรีสตาร์ต", "Persistent encryption secret across restarts"],
  ["ยังไม่ตั้งใน .env — ระบบใช้คีย์ชั่วคราวต่อรอบ (ลิงก์เดิมจะหมดอายุเมื่อรีสตาร์ต)", "Not set in .env — using ephemeral per-boot key"],
  ["โฟลเดอร์จัดเก็บข้อมูลต้องอ่าน/เขียนได้", "Storage directory must be readable/writable"],
  ["แก้ไขได้ในไฟล์ .env แล้วปิด-เปิดเซิร์ฟเวอร์ใหม่เท่านั้น", "Read-only; edit .env and restart server to change"],
  ["ไม่พบ FFmpeg ใน .env (FFMPEG_PATH) หรือ System PATH — วิดีโอ Codec H.265/HEVC จะเล่นเฉพาะเสียงบนเบราว์เซอร์ที่ไม่รองรับจนกว่าจะติดตั้ง FFmpeg", "FFmpeg not found in .env (FFMPEG_PATH) or System PATH — H.265/HEVC videos will play audio-only on unsupported browsers until FFmpeg is installed"],
  ["ปิดกั้นการเข้าถึงไฟล์ผ่านพาร์ท URL ตรง", "Blocks direct static URL access"],
  ["ถูกบล็อก 100%", "100% blocked"],
  ["เข้ารหัสโทเคนสื่อด้วย", "Encrypts media tokens with"],
  ["และรองรับ Byte-Range Streaming + บล็อกการรันไฟล์", "with Byte-Range Streaming + blocks active execution of"],
  ["เก็บประวัติการใช้งานระบบ (Activity Log) ไว้", "Retains system Activity Logs for"],
  ["แจ้งเตือนรอดำเนินการ:", "Pending Alerts:"],
  ["ถูก Mute อยู่:", "Currently Muted:"],
  ["แบนอุปกรณ์:", "Banned Devices:"],
  ["แบน IP:", "Banned IPs:"],
  ["ช่วงเวลาพีควันนี้:", "Peak Hour Today:"],
  ["ไม่มีคำอธิบาย", "No description"],
  ["ยืนยันการลบ", "Confirm Delete"],
  ["ยืนยันระงับการใช้งาน", "Confirm Suspension"],
  ["ยืนยันลบอุปกรณ์", "Confirm Delete Device"],
  ["รายการรอดำเนินการ", "Pending"],
  ["ทั้งหมด", "Total"],
  ["อุปกรณ์", "Devices"],
  ["ออนไลน์", "Online"],
  ["ข้อความ", "Messages"],
  ["ไฟล์", "Files"],
  ["ตัว", "items"],
  ["วัน", "days"],
  ["นาที", "min"],
  ["วินาที", "sec"],
];

export function translateUiTextToEn(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || !THAI_CHAR_RE.test(trimmed)) return raw;
  if (ANIMAL_NICKNAME_RE.test(trimmed)) return raw;

  const exact = EXACT_PHRASE_MAP[trimmed];
  if (exact) {
    return raw.replace(trimmed, exact);
  }

  for (const [re, replacer] of REGEX_RULES) {
    const match = trimmed.match(re);
    if (match) {
      return raw.replace(trimmed, replacer(...match));
    }
  }

  let out = raw;
  for (const [th, en] of SUBSTRING_MAP) {
    if (out.includes(th)) {
      out = out.split(th).join(en);
    }
  }
  return out;
}

const origTextMap = new WeakMap<Node, string>();
const origAttrMap = new WeakMap<Element, Record<string, string>>();
const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label"] as const;

function isInsideNoI18n(node: Node | null): boolean {
  let curr: Node | null = node;
  while (curr) {
    if (curr instanceof HTMLElement) {
      if (curr.dataset?.noI18n === "true" || curr.isContentEditable) return true;
      const tag = curr.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "CODE") return true;
    }
    curr = curr.parentNode;
  }
  return false;
}

function applyDomTranslation(root: HTMLElement, lang: AppLang) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode: Node | null = walker.nextNode();
  while (textNode) {
    if (!isInsideNoI18n(textNode)) {
      const currentVal = textNode.nodeValue || "";
      if (lang === "en") {
        if (THAI_CHAR_RE.test(currentVal)) {
          const baseTh = origTextMap.get(textNode) ?? currentVal;
          if (!origTextMap.has(textNode)) origTextMap.set(textNode, currentVal);
          const nextEn = translateUiTextToEn(baseTh);
          if (nextEn !== currentVal) textNode.nodeValue = nextEn;
        }
      } else {
        const savedTh = origTextMap.get(textNode);
        if (savedTh !== undefined && currentVal !== savedTh) {
          textNode.nodeValue = savedTh;
        }
      }
    }
    textNode = walker.nextNode();
  }

  const elements = root.querySelectorAll("[placeholder], [title], [aria-label]");
  elements.forEach((el) => {
    if (isInsideNoI18n(el)) return;
    let saved = origAttrMap.get(el);
    if (!saved) {
      saved = {};
      origAttrMap.set(el, saved);
    }
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val) continue;
      if (lang === "en") {
        if (THAI_CHAR_RE.test(val)) {
          if (!(attr in saved)) saved[attr] = val;
          const nextEn = translateUiTextToEn(saved[attr] || val);
          if (nextEn !== val) el.setAttribute(attr, nextEn);
        }
      } else if (attr in saved) {
        if (val !== saved[attr]) el.setAttribute(attr, saved[attr]);
      }
    }
  });
}

export function useAutoDomTranslate(lang: AppLang) {
  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return;
    applyDomTranslation(document.body, lang);

    if (lang !== "en") return;

    let rafId: number | null = null;
    const observer = new MutationObserver(() => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (document.body) applyDomTranslation(document.body, lang);
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [lang]);
}
