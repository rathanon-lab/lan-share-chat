/**
 * LAN Share Chat v3.2.0 — 100% Offline RAM Mock Backend & Figma-Style Simulation Layer
 * Runs the ACTUAL compiled Next.js 16 + React 19 + Tailwind v4 frontend completely serverless in browser RAM.
 * - Zero outbound network requests
 * - Zero real local file uploads (<input type="file">.click() is intercepted with a Figma-style simulated file popup)
 * - 3 Simulated Male Peers online (Direct P2P Send with 3.5s delay -> Auto-Accept -> Animated Taskbar Progress Bar)
 * - All 16 real .webp stickers & 20+1 real .webp animal avatars
 * - Admin login bypass (works with or without entering a password)
 * - Volatile RAM storage (resets cleanly on browser Refresh / F5)
 */
(function () {
  "use strict";

  // 1. Detect Base Path (supports both http://localhost:8090/ and https://rathanon-lab.github.io/lan-share-chat/)
  var rawPath = window.location.pathname || "";
  var BASE_PATH = rawPath
    .replace(/\/admin(?:\/index\.html|\/)?$/, "")
    .replace(/\/admin\.html$/, "")
    .replace(/\/index\.html$/, "")
    .replace(/\/$/, "");

  var isSubAdminPage = rawPath.indexOf("/admin") !== -1;
  window.__LAN_BASE_PATH__ = BASE_PATH;
  globalThis.TURBOPACK_CHUNK_BASE_PATH = isSubAdminPage ? "../_next/" : "./_next/";

  function resolveAssetUrl(u) {
    if (!u || typeof u !== "string") return u;
    if (
      BASE_PATH &&
      (u.indexOf("/avatars/") === 0 ||
        u.indexOf("/stickers/") === 0 ||
        u.indexOf("/emoji/") === 0 ||
        u.indexOf("/media/") === 0 ||
        u.indexOf("/_next/") === 0 ||
        u === "/favicon.ico" ||
        u === "/manifest.webmanifest" ||
        u === "/pdf.worker.min.mjs")
    ) {
      return BASE_PATH + u;
    }
    return u;
  }

  // Hook Image.src & Element.setAttribute so dynamic root-relative asset paths work under GitHub Pages subpaths
  if (BASE_PATH) {
    var origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, val) {
      if ((name === "src" || name === "href") && typeof val === "string") {
        val = resolveAssetUrl(val);
      }
      return origSetAttr.call(this, name, val);
    };
    var imgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (imgSrcDesc && imgSrcDesc.set) {
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        get: imgSrcDesc.get,
        set: function (v) {
          return imgSrcDesc.set.call(this, resolveAssetUrl(v));
        },
        configurable: true,
      });
    }
  }

  // Force WebRTC P2P to use the real built-in chunked progress loop (sendViaRelay) in useWebRTCTransfer.ts
  try {
    delete window.RTCPeerConnection;
    delete window.webkitRTCPeerConnection;
  } catch (e) {
    window.RTCPeerConnection = undefined;
  }

  // Reset volatile RAM state when user presses Refresh (F5)
  var navEntries =
    typeof performance !== "undefined" && performance.getEntriesByType
      ? performance.getEntriesByType("navigation")
      : [];
  var isPageReload = navEntries.length > 0 && navEntries[0].type === "reload";
  if (isPageReload) {
    try {
      window.name = "";
      sessionStorage.removeItem("adminToken");
      localStorage.removeItem("adminToken");
    } catch (e) {}
  }

  // 2. Real Avatar Presets & Real 16 Sticker Items
  var AVATAR_PRESETS = [
    { id: "01-penguin", name: "เพนกวิน", file: "01-penguin.webp", url: resolveAssetUrl("/avatars/01-penguin.webp") },
    { id: "02-seal", name: "แมวน้ำ", file: "02-seal.webp", url: resolveAssetUrl("/avatars/02-seal.webp") },
    { id: "03-orca", name: "วาฬเพชฌฆาต", file: "03-orca.webp", url: resolveAssetUrl("/avatars/03-orca.webp") },
    { id: "04-sugar-glider", name: "ชูการ์ไกลเดอร์", file: "04-sugar-glider.webp", url: resolveAssetUrl("/avatars/04-sugar-glider.webp") },
    { id: "05-tanuki", name: "ทานูกิ", file: "05-tanuki.webp", url: resolveAssetUrl("/avatars/05-tanuki.webp") },
    { id: "06-panda", name: "แพนด้า", file: "06-panda.webp", url: resolveAssetUrl("/avatars/06-panda.webp") },
    { id: "07-sea-otter", name: "นากทะเล", file: "07-sea-otter.webp", url: resolveAssetUrl("/avatars/07-sea-otter.webp") },
    { id: "08-fox", name: "จิ้งจอก", file: "08-fox.webp", url: resolveAssetUrl("/avatars/08-fox.webp") },
    { id: "09-shiba", name: "ชิบะอินุ", file: "09-shiba.webp", url: resolveAssetUrl("/avatars/09-shiba.webp") },
    { id: "10-orange-cat", name: "แมวส้ม", file: "10-orange-cat.webp", url: resolveAssetUrl("/avatars/10-orange-cat.webp") },
    { id: "11-bunny", name: "กระต่าย", file: "11-bunny.webp", url: resolveAssetUrl("/avatars/11-bunny.webp") },
    { id: "12-owl", name: "นกฮูก", file: "12-owl.webp", url: resolveAssetUrl("/avatars/12-owl.webp") },
    { id: "13-sloth", name: "สลอธ", file: "13-sloth.webp", url: resolveAssetUrl("/avatars/13-sloth.webp") },
    { id: "14-raccoon", name: "แรคคูน", file: "14-raccoon.webp", url: resolveAssetUrl("/avatars/14-raccoon.webp") },
    { id: "15-capybara", name: "คาปิบาร่า", file: "15-capybara.webp", url: resolveAssetUrl("/avatars/15-capybara.webp") },
    { id: "16-koala", name: "โคอาล่า", file: "16-koala.webp", url: resolveAssetUrl("/avatars/16-koala.webp") },
    { id: "17-red-panda", name: "แพนด้าแดง", file: "17-red-panda.webp", url: resolveAssetUrl("/avatars/17-red-panda.webp") },
    { id: "18-duck", name: "เป็ดน้อย", file: "18-duck.webp", url: resolveAssetUrl("/avatars/18-duck.webp") },
    { id: "19-frog", name: "กบเขียว", file: "19-frog.webp", url: resolveAssetUrl("/avatars/19-frog.webp") },
    { id: "20-lion", name: "สิงโต", file: "20-lion.webp", url: resolveAssetUrl("/avatars/20-lion.webp") },
  ];

  var BUILTIN_STICKER_ITEMS = [
    { id: 1, packId: "starter-office-animals", stickerId: "01-good-morning", fileName: "01-good-morning.webp", url: resolveAssetUrl("/stickers/starter-office-animals/01-good-morning.webp"), alt: "สวัสดีตอนเช้า", keywords: "morning good morning cat sun สวัสดีตอนเช้า มอร์นิ่ง", sortOrder: 1 },
    { id: 2, packId: "starter-office-animals", stickerId: "02-sawasdee", fileName: "02-sawasdee.webp", url: resolveAssetUrl("/stickers/starter-office-animals/02-sawasdee.webp"), alt: "สวัสดีครับ/ค่ะ", keywords: "hello hi sawasdee wai rabbit สวัสดี ไหว้ ขอบคุณ", sortOrder: 2 },
    { id: 3, packId: "starter-office-animals", stickerId: "03-ok-thumbsup", fileName: "03-ok-thumbsup.webp", url: resolveAssetUrl("/stickers/starter-office-animals/03-ok-thumbsup.webp"), alt: "โอเค รับทราบ!", keywords: "ok okay thumbs up roger dog โอเค รับทราบ ได้เลย เยี่ยม", sortOrder: 3 },
    { id: 4, packId: "starter-office-animals", stickerId: "04-thank-you", fileName: "04-thank-you.webp", url: resolveAssetUrl("/stickers/starter-office-animals/04-thank-you.webp"), alt: "ขอบคุณมากๆ ❤️", keywords: "thank you heart love capybara ขอบคุณ รัก ซึ้ง", sortOrder: 4 },
    { id: 5, packId: "starter-office-animals", stickerId: "05-haha-lol", fileName: "05-haha-lol.webp", url: resolveAssetUrl("/stickers/starter-office-animals/05-haha-lol.webp"), alt: "555 ขำกลิ้ง!", keywords: "555 lol haha laugh husky ขำ หัวเราะ ฮา", sortOrder: 5 },
    { id: 6, packId: "starter-office-animals", stickerId: "06-what-shock", fileName: "06-what-shock.webp", url: resolveAssetUrl("/stickers/starter-office-animals/06-what-shock.webp"), alt: "อะไรวะเนี่ย!?", keywords: "what shocked omg confused owl อะไร ตกใจ งง เหวอ", sortOrder: 6 },
    { id: 7, packId: "starter-office-animals", stickerId: "07-bye-bye", fileName: "07-bye-bye.webp", url: resolveAssetUrl("/stickers/starter-office-animals/07-bye-bye.webp"), alt: "บ๊ายบายจ้า", keywords: "bye goodbye wave rabbit บ๊ายบาย ลา ก่อนนะ", sortOrder: 7 },
    { id: 8, packId: "starter-office-animals", stickerId: "08-sleepy", fileName: "08-sleepy.webp", url: resolveAssetUrl("/stickers/starter-office-animals/08-sleepy.webp"), alt: "ง่วงไม่ไหว...", keywords: "sleepy tired yawn sloth ง่วง พัก นอน", sortOrder: 8 },
    { id: 9, packId: "starter-office-animals", stickerId: "09-fighting", fileName: "09-fighting.webp", url: resolveAssetUrl("/stickers/starter-office-animals/09-fighting.webp"), alt: "สู้ๆ นะ!", keywords: "fighting cheer up shiba สู้ๆ เป็นกำลังใจ", sortOrder: 9 },
    { id: 10, packId: "starter-office-animals", stickerId: "10-hungry", fileName: "10-hungry.webp", url: resolveAssetUrl("/stickers/starter-office-animals/10-hungry.webp"), alt: "หิวแล้ววว", keywords: "hungry food noodles panda หิว กินข้าว ก๋วยเตี๋ยว", sortOrder: 10 },
    { id: 11, packId: "starter-office-animals", stickerId: "11-omw", fileName: "11-omw.webp", url: resolveAssetUrl("/stickers/starter-office-animals/11-omw.webp"), alt: "กำลังไป รอแป๊บ!", keywords: "omw running hurry penguin กำลังไป รอแป๊บ รีบ", sortOrder: 11 },
    { id: 12, packId: "starter-office-animals", stickerId: "12-awesome", fileName: "12-awesome.webp", url: resolveAssetUrl("/stickers/starter-office-animals/12-awesome.webp"), alt: "เยี่ยมเลย!", keywords: "awesome clap bravo otter เยี่ยม สุดยอด ปรบมือ", sortOrder: 12 },
    { id: 13, packId: "starter-office-animals", stickerId: "13-crying", fileName: "13-crying.webp", url: resolveAssetUrl("/stickers/starter-office-animals/13-crying.webp"), alt: "ฮือออ 😭", keywords: "cry sad tears cat ร้องไห้ เศร้า ฮือ", sortOrder: 13 },
    { id: 14, packId: "starter-office-animals", stickerId: "14-sorry", fileName: "14-sorry.webp", url: resolveAssetUrl("/stickers/starter-office-animals/14-sorry.webp"), alt: "ขอโทษนะ...", keywords: "sorry apologize bow bear ขอโทษ ผิดไปแล้ว", sortOrder: 14 },
    { id: 15, packId: "starter-office-animals", stickerId: "15-working", fileName: "15-working.webp", url: resolveAssetUrl("/stickers/starter-office-animals/15-working.webp"), alt: "ปั่นงานวนไป", keywords: "work laptop coding coffee fox ทำงาน ปั่นงาน สู้ชีวิต", sortOrder: 15 },
    { id: 16, packId: "starter-office-animals", stickerId: "16-good-night", fileName: "16-good-night.webp", url: resolveAssetUrl("/stickers/starter-office-animals/16-good-night.webp"), alt: "ฝันดีนะ", keywords: "goodnight sleep bunny star ฝันดี ราตรีสวัสดิ์ นอน", sortOrder: 16 },
  ];

  var BUILTIN_PACK = {
    packId: "starter-office-animals",
    name: "แก๊งสัตว์น้อยประจำห้อง",
    description: "ชุดสติกเกอร์เริ่มต้น 16 ตัว ภาษาไทยน่ารัก ใช้ได้ทุกวัน (Built-in Pack)",
    mainUrl: resolveAssetUrl("/stickers/starter-office-animals/main.webp"),
    tabUrl: resolveAssetUrl("/stickers/starter-office-animals/tab.webp"),
    source: "builtin",
    enabled: true,
    sortOrder: 1,
    createdAt: Date.now() - 86400000 * 7,
    items: BUILTIN_STICKER_ITEMS,
  };

  // In-memory Blob cache for encrypted media tokens
  var mediaBlobStore = new Map();
  var mediaUrlMapping = {
    tok_showcase_desktop: resolveAssetUrl("/media/showcase-desktop.png"),
    tok_showcase_admin: resolveAssetUrl("/media/showcase-admin.png"),
    tok_showcase_ipad: resolveAssetUrl("/media/showcase-ipad.png"),
    tok_showcase_mobile: resolveAssetUrl("/media/showcase-mobile.png"),
  };

  function createDefaultState() {
    var now = Date.now();
    return {
      myIdentity: {
        deviceId: "dev_me_owl_321",
        name: "นกฮูก_321",
        ip: "192.168.1.2",
        avatarUrl: resolveAssetUrl("/avatars/12-owl.webp"),
        os: "Windows",
        browser: "Chrome",
      },
      // 3 Simulated Male Peers in the LAN
      malePeers: [
        {
          id: "sock_male_1",
          deviceId: "dev_male_1",
          name: "โคอาล่า_197 (คุณเคน)",
          avatarUrl: resolveAssetUrl("/avatars/16-koala.webp"),
          os: "macOS",
          browser: "Safari",
          ip: "192.168.1.12",
          tabCount: 1,
          status: "online",
          mutedUntil: 0,
          isBanned: 0,
        },
        {
          id: "sock_male_2",
          deviceId: "dev_male_2",
          name: "ชิบะ_404 (คุณอเล็กซ์)",
          avatarUrl: resolveAssetUrl("/avatars/09-shiba.webp"),
          os: "Windows",
          browser: "Edge",
          ip: "192.168.1.18",
          tabCount: 1,
          status: "online",
          mutedUntil: 0,
          isBanned: 0,
        },
        {
          id: "sock_male_3",
          deviceId: "dev_male_3",
          name: "สิงโต_808 (คุณต้น)",
          avatarUrl: resolveAssetUrl("/avatars/20-lion.webp"),
          os: "iPhone",
          browser: "Safari",
          ip: "192.168.1.24",
          tabCount: 1,
          status: "online",
          mutedUntil: 0,
          isBanned: 0,
        },
      ],
      systemSettings: {
        voiceMessageEnabled: true,
        deletePolicy: "hybrid_15m",
        editWindowMinutes: 15,
        adminRingColor: "#2563EB",
        adminAvatarUrl: resolveAssetUrl("/avatars/admin-special.webp"),
        adminHoldActive: false,
        chatLocked: false,
        chatBlurred: false,
        antiSpamEnabled: true,
        spamMaxMessages: 8,
        spamWindowSeconds: 10,
        spamMuteMinutes: 5,
        spamMaxDuplicates: 5,
        p2pMaxOffersPerWindow: 6,
        sessionPolicy: "multi_allow",
        maxConcurrentUsers: 100,
        stickerPreviewMode: "docked_tray",
        stickerCollageEnabled: true,
        stickerPickerGifMode: "live_viewport",
      },
      stickerPacks: [BUILTIN_PACK],
      messages: [
        {
          id: 101,
          sender: "โคอาล่า_197 (คุณเคน)",
          senderDeviceId: "dev_male_1",
          senderAvatarUrl: resolveAssetUrl("/avatars/16-koala.webp"),
          senderOs: "macOS",
          senderStatus: "active",
          text: "สวัสดีครับทีม! ระบบ LAN Share Chat v3.2.0 พร้อมใช้งานแล้ว ลองกดปุ่ม Send ข้างชื่อพวกผมทั้ง 3 คนทางซ้ายเพื่อทดสอบส่งไฟล์ Direct P2P ได้เลยครับ 🚀",
          type: "text",
          time: "09:40",
          createdAt: now - 360000,
          isRead: 1,
          readAt: now - 350000,
        },
        {
          id: 102,
          sender: "ชิบะ_404 (คุณอเล็กซ์)",
          senderDeviceId: "dev_male_2",
          senderAvatarUrl: resolveAssetUrl("/avatars/09-shiba.webp"),
          senderOs: "Windows",
          senderStatus: "active",
          text: "สวัสดีตอนเช้า",
          type: "sticker",
          stickerMeta: {
            packId: "starter-office-animals",
            stickerId: "01-good-morning",
            url: resolveAssetUrl("/stickers/starter-office-animals/01-good-morning.webp"),
            alt: "สวัสดีตอนเช้า",
          },
          time: "09:41",
          createdAt: now - 300000,
          isRead: 1,
          readAt: now - 290000,
        },
        {
          id: 103,
          sender: "สิงโต_808 (คุณต้น)",
          senderDeviceId: "dev_male_3",
          senderAvatarUrl: resolveAssetUrl("/avatars/20-lion.webp"),
          senderOs: "iPhone",
          senderStatus: "active",
          text: "ผมส่งภาพหน้าจอระบบลงห้องแชทให้ลองคลิกซูมดูครับ หรือกดปุ่ม + / รูปภาพ / สติกเกอร์ ด้านล่างเพื่อทดลองส่งข้อความจำลองได้เลย (รีเฟรชหน้าเว็บแล้วข้อมูลที่พิมพ์เล่นจะรีเซ็ตทันทีครับ)",
          type: "file",
          fileName: "Showcase_Desktop_UI_v3.2.png",
          fileSize: 428500,
          mimeType: "image/png",
          mediaToken: "tok_showcase_desktop",
          attachments: [
            {
              fileId: 1,
              fileName: "Showcase_Desktop_UI_v3.2.png",
              fileSize: 428500,
              mimeType: "image/png",
              mediaToken: "tok_showcase_desktop",
            },
          ],
          time: "09:43",
          createdAt: now - 180000,
          isRead: 1,
          readAt: now - 170000,
        },
      ],
      adminFiles: [
        {
          id: 1,
          originalName: "Showcase_Desktop_UI_v3.2.png",
          storedName: "enc_01_desktop.bin",
          mimeType: "image/png",
          fileSize: 428500,
          sender: "สิงโต_808 (คุณต้น)",
          senderIp: "192.168.1.24",
          uploadedAt: new Date(now - 180000).toISOString(),
          mediaToken: "tok_showcase_desktop",
        },
        {
          id: 2,
          originalName: "Admin_Governance_Console_v3.2.png",
          storedName: "enc_02_admin.bin",
          mimeType: "image/png",
          fileSize: 389200,
          sender: "ชิบะ_404 (คุณอเล็กซ์)",
          senderIp: "192.168.1.18",
          uploadedAt: new Date(now - 540000).toISOString(),
          mediaToken: "tok_showcase_admin",
        },
        {
          id: 3,
          originalName: "iPad_Responsive_Workspace.png",
          storedName: "enc_03_ipad.bin",
          mimeType: "image/png",
          fileSize: 312400,
          sender: "โคอาล่า_197 (คุณเคน)",
          senderIp: "192.168.1.12",
          uploadedAt: new Date(now - 920000).toISOString(),
          mediaToken: "tok_showcase_ipad",
        },
        {
          id: 4,
          originalName: "Mobile_Portrait_View.png",
          storedName: "enc_04_mobile.bin",
          mimeType: "image/png",
          fileSize: 264100,
          sender: "สิงโต_808 (คุณต้น)",
          senderIp: "192.168.1.24",
          uploadedAt: new Date(now - 1200000).toISOString(),
          mediaToken: "tok_showcase_mobile",
        },
      ],
      alerts: [
        {
          id: 1,
          alertType: "mention_admin",
          messageId: 101,
          sender: "โคอาล่า_197 (คุณเคน)",
          deviceId: "dev_male_1",
          previewText: "@admin รบกวนช่วยตรวจสอบโควตาพื้นที่โฟลเดอร์ Release Build ให้หน่อยครับ",
          reason: "มีการกล่าวถึง @admin ในห้องแชท",
          status: "pending",
          createdAt: now - 240000,
        },
        {
          id: 2,
          alertType: "delete_request",
          messageId: 103,
          sender: "สิงโต_808 (คุณต้น)",
          deviceId: "dev_male_3",
          previewText: "ขอลบไฟล์ทดสอบเก่าหลังหมดเวลา Edit Window 15 นาที",
          reason: "ผู้ใช้ร้องขอให้แอดมินลบข้อความนี้",
          status: "pending",
          createdAt: now - 120000,
        },
      ],
      logs: [
        {
          id: 1,
          action: "UPLOAD_FILE",
          actor: "สิงโต_808 (คุณต้น)",
          actorIp: "192.168.1.24",
          details: JSON.stringify({ originalName: "Showcase_Desktop_UI_v3.2.png", size: 428500, encrypted: "AES-256-GCM" }),
          timestamp: new Date(now - 180000).toISOString(),
        },
        {
          id: 2,
          action: "SEND_STICKER",
          actor: "ชิบะ_404 (คุณอเล็กซ์)",
          actorIp: "192.168.1.18",
          details: JSON.stringify({ packId: "starter-office-animals", stickerId: "01-good-morning" }),
          timestamp: new Date(now - 300000).toISOString(),
        },
        {
          id: 3,
          action: "PEER_CONNECTED",
          actor: "โคอาล่า_197 (คุณเคน)",
          actorIp: "192.168.1.12",
          details: JSON.stringify({ os: "macOS", browser: "Safari", transport: "WebRTC + Socket.IO" }),
          timestamp: new Date(now - 360000).toISOString(),
        },
      ],
      bannedIps: [],
      webboardPosts: [
        {
          id: "wb-1",
          title: "📐 แปลนสถาปัตยกรรม LAN WebRTC P2P DataChannel (16KB Chunks)",
          author: "โคอาล่า_197 (คุณเคน)",
          avatar: resolveAssetUrl("/avatars/16-koala.webp"),
          role: "Senior Network Eng.",
          time: "วันนี้ • 09:35 น.",
          desc: "เอกสารโครงสร้างการส่งไฟล์ P2P ในวงแลน พร้อมระบบสลับไปใช้ Socket.IO Relay อัตโนมัติภายใน 3.5 วินาที กดจำลองดาวน์โหลดได้เลยครับ",
          fileName: "LAN_WebRTC_Architecture_v3.2.pdf",
          fileSize: "4.2 MB",
          thumb: resolveAssetUrl("/media/showcase-desktop.png"),
          downloads: 14,
        },
        {
          id: "wb-2",
          title: "🛡️ คู่มือผู้ดูแลระบบ 9-Tab Admin Governance Console & AES-256-GCM",
          author: "ชิบะ_404 (คุณอเล็กซ์)",
          avatar: resolveAssetUrl("/avatars/09-shiba.webp"),
          role: "DevOps Lead",
          time: "วันนี้ • 09:20 น.",
          desc: "รวมฟีเจอร์จัดการห้องแชท กวาดสแปม จัดการชุดสติกเกอร์ และตรวจสอบโควตาพื้นที่ 6 โซน",
          fileName: "Admin_Governance_Guide_v3.2.zip",
          fileSize: "18.6 MB",
          thumb: resolveAssetUrl("/media/showcase-admin.png"),
          downloads: 9,
        },
        {
          id: "wb-3",
          title: "📱 รายงานผลทดสอบ Responsive UI บน iPadOS & iPhone 15",
          author: "สิงโต_808 (คุณต้น)",
          avatar: resolveAssetUrl("/avatars/20-lion.webp"),
          role: "QA Automation",
          time: "วันนี้ • 09:10 น.",
          desc: "ทดสอบ Docked Sticker Preview Tray และ Sticker Collage Studio บนจอสัมผัส ลื่นไหล 60fps ไม่กระตุก",
          fileName: "QA_Mobile_iPad_Benchmark.docx",
          fileSize: "2.4 MB",
          thumb: resolveAssetUrl("/media/showcase-ipad.png"),
          downloads: 7,
        },
      ],
    };
  }

  // Load volatile session state from window.name (preserved across / <-> /admin navigation, wiped on F5 reload)
  var state = null;
  try {
    if (window.name && window.name.indexOf("__LAN_DEMO_V3__:") === 0) {
      state = JSON.parse(window.name.slice("__LAN_DEMO_V3__:".length));
    }
  } catch (e) {
    state = null;
  }
  if (!state) {
    state = createDefaultState();
  }
  window.__LAN_DEMO_STATE__ = state;

  function saveVolatileState() {
    try {
      window.name = "__LAN_DEMO_V3__:" + JSON.stringify(state);
    } catch (e) {}
  }

  try {
    localStorage.setItem("deviceId", state.myIdentity.deviceId);
  } catch (e) {}

  function nowTimeStr() {
    var d = new Date();
    return d.toTimeString().slice(0, 5);
  }

  function addAuditLog(action, actor, actorIp, detailsObj) {
    state.logs.unshift({
      id: Date.now() + Math.floor(Math.random() * 1000),
      action: action,
      actor: actor,
      actorIp: actorIp || "192.168.1.2",
      details: typeof detailsObj === "string" ? detailsObj : JSON.stringify(detailsObj),
      timestamp: new Date().toISOString(),
    });
    saveVolatileState();
  }

  function getActivePeersList() {
    var list = [
      {
        id: "sock_me",
        deviceId: state.myIdentity.deviceId,
        name: state.myIdentity.name,
        avatarUrl: state.myIdentity.avatarUrl,
        os: state.myIdentity.os,
        browser: state.myIdentity.browser,
        ip: state.myIdentity.ip,
        tabCount: 1,
        status: "online",
      },
    ];
    state.malePeers.forEach(function (p) {
      if (!p.isBanned) {
        list.push({
          id: p.id,
          deviceId: p.deviceId,
          name: p.name,
          avatarUrl: p.avatarUrl,
          os: p.os,
          browser: p.browser,
          ip: p.ip,
          tabCount: 1,
          status: p.status || "online",
        });
      }
    });
    return list;
  }

  // 3. In-Memory Mock Socket.IO Engine
  var activeSockets = [];

  function broadcastSocketEvent(ev, data) {
    activeSockets.forEach(function (s) {
      s._trigger(ev, data);
    });
  }

  window.__createMockLanSocket = function (opts) {
    var handlers = {};
    var sock = {
      id: "mock_sock_" + Math.random().toString(36).slice(2, 8),
      connected: true,
      opts: opts || {},
      on: function (ev, fn) {
        if (!handlers[ev]) handlers[ev] = [];
        handlers[ev].push(fn);
        return sock;
      },
      off: function (ev, fn) {
        if (!handlers[ev]) return sock;
        if (!fn) {
          delete handlers[ev];
        } else {
          handlers[ev] = handlers[ev].filter(function (f) {
            return f !== fn;
          });
        }
        return sock;
      },
      _trigger: function (ev, payload) {
        var list = handlers[ev] || [];
        list.forEach(function (fn) {
          try {
            fn(payload);
          } catch (err) {
            console.error("[MockSocket handler error]", ev, err);
          }
        });
      },
      timeout: function () {
        return {
          emit: function (ev, payload, ack) {
            return sock.emit(ev, payload, ack);
          },
        };
      },
      connect: function () {
        sock.connected = true;
        sock._trigger("connect");
        return sock;
      },
      disconnect: function () {
        sock.connected = false;
        activeSockets = activeSockets.filter(function (s) {
          return s !== sock;
        });
        return sock;
      },
      emit: function (ev, payload, ack) {
        handleClientSocketEmit(sock, ev, payload, ack);
        return sock;
      },
    };

    activeSockets.push(sock);

    // Boot initial events asynchronously after hook attaches listeners
    setTimeout(function () {
      if (!sock.connected) return;
      sock._trigger("connect");
      sock._trigger("identity", state.myIdentity);
      sock._trigger("settings_update", state.systemSettings);
      sock._trigger("sticker_packs_update", state.stickerPacks);
      sock._trigger("peers_update", getActivePeersList());
      sock._trigger("chat_history", state.messages.slice());
      sock._trigger("chat_history_meta", {
        hasMore: false,
        oldestId: state.messages.length > 0 ? state.messages[0].id : null,
        totalCount: state.messages.length,
      });
    }, 60);

    return sock;
  };

  function handleClientSocketEmit(sock, ev, payload, ack) {
    if (ev === "send_message" && payload) {
      var msgId = Date.now() + Math.floor(Math.random() * 100);
      var mentionAdmin =
        typeof payload.text === "string" &&
        (payload.text.toLowerCase().indexOf("@admin") !== -1 || payload.text.toLowerCase().indexOf("#help") !== -1);

      var newMsg = {
        id: msgId,
        sender: state.myIdentity.name,
        senderDeviceId: state.myIdentity.deviceId,
        senderAvatarUrl: state.myIdentity.avatarUrl,
        senderOs: state.myIdentity.os,
        senderStatus: "active",
        text: payload.text || "",
        type: payload.type || "text",
        stickerMeta: payload.stickerMeta || null,
        attachments: payload.attachments || [],
        time: nowTimeStr(),
        createdAt: Date.now(),
        mentionAdmin: mentionAdmin ? 1 : 0,
        isRead: 1,
        readAt: Date.now(),
      };

      state.messages.push(newMsg);
      addAuditLog(
        payload.type === "sticker" ? "SEND_STICKER" : "CHAT_MESSAGE",
        state.myIdentity.name,
        state.myIdentity.ip,
        { text: newMsg.text, type: newMsg.type }
      );
      saveVolatileState();
      broadcastSocketEvent("receive_message", newMsg);

      if (mentionAdmin) {
        var newAlert = {
          id: Date.now(),
          alertType: "mention_admin",
          messageId: msgId,
          sender: state.myIdentity.name,
          deviceId: state.myIdentity.deviceId,
          previewText: newMsg.text,
          reason: "มีการกล่าวถึง @admin ในห้องแชท",
          status: "pending",
          createdAt: Date.now(),
        };
        state.alerts.unshift(newAlert);
        saveVolatileState();
        broadcastSocketEvent("admin_alert", newAlert);
      }

      // Auto-reply from one of the 3 simulated male peers after 1.5s
      scheduleMalePeerReply(newMsg);
      if (typeof ack === "function") ack({ ok: true });
      return;
    }

    if (ev === "mark_messages_read") {
      if (typeof ack === "function") ack({ ok: true });
      return;
    }

    // Direct P2P Signaling Simulation (3.5s Delay -> Auto-Accept -> Progress Taskbar!)
    if (ev === "webrtc_signaling" && payload) {
      var targetPeer =
        state.malePeers.find(function (p) {
          return p.deviceId === payload.targetDeviceId || p.ip === payload.targetIp;
        }) || state.malePeers[0];

      if (payload.type === "transfer_request") {
        showProtoBannerToast(
          "⏳ จำลองส่ง P2P หา " +
            targetPeer.name +
            " — รอฝั่งผู้รับกดยอมรับอัตโนมัติใน 3.5 วินาที...",
          "#2563eb"
        );
        addAuditLog("P2P_OFFER", state.myIdentity.name, state.myIdentity.ip, {
          target: targetPeer.name,
          targetIp: targetPeer.ip,
          files: payload.payload ? payload.payload.files : [],
        });

        setTimeout(function () {
          showProtoBannerToast(
            "⚡ " + targetPeer.name + " กดรับไฟล์อัตโนมัติแล้ว! กำลังวิ่งหลอด Taskbar ส่งไฟล์ 0% → 100%...",
            "#10b981"
          );
          sock._trigger("webrtc_signaling", {
            type: "transfer_accept",
            senderDeviceId: targetPeer.deviceId,
            senderIp: targetPeer.ip,
            senderName: targetPeer.name,
            payload: {},
          });
        }, 3500);
        return;
      }

      if (payload.type === "transfer_accept") {
        // User clicked Accept inside the real P2PReceiveModal when a male peer sent a file to us!
        simulateIncomingRelayChunksToClient(sock, targetPeer);
        return;
      }
      return;
    }

    // Chunked P2P Transfer Progress Loop (drives the real P2PSendModal progress bar 0% -> 100%)
    if (ev === "direct_relay" && payload) {
      var delayMs = payload.relayType === "file_chunk" ? 110 : 40;
      setTimeout(function () {
        if (typeof ack === "function") ack({ ok: true });
        if (payload.relayType === "file_end") {
          var peer =
            state.malePeers.find(function (p) {
              return p.deviceId === payload.targetDeviceId || p.ip === payload.targetIp;
            }) || state.malePeers[0];
          showProtoBannerToast("🎉 ส่งไฟล์ Direct P2P ให้ " + peer.name + " สำเร็จ 100%!", "#059669");
          addAuditLog("P2P_COMPLETED", state.myIdentity.name, state.myIdentity.ip, {
            target: peer.name,
            transferId: payload.id,
          });

          // Peer posts a thank-you message in the real chat room!
          setTimeout(function () {
            var thankMsg = {
              id: Date.now() + 9,
              sender: peer.name,
              senderDeviceId: peer.deviceId,
              senderAvatarUrl: peer.avatarUrl,
              senderOs: peer.os,
              senderStatus: "active",
              text: "ได้รับไฟล์ผ่าน Direct P2P ครบ 100% เรียบร้อยแล้วครับ ความเร็วเต็มสปีดแลนเลย ขอบคุณครับ! 🙏⚡",
              type: "text",
              time: nowTimeStr(),
              createdAt: Date.now(),
              isRead: 1,
              readAt: Date.now(),
            };
            state.messages.push(thankMsg);
            saveVolatileState();
            broadcastSocketEvent("receive_message", thankMsg);
          }, 900);
        }
      }, delayMs);
      return;
    }

    if (typeof ack === "function") ack({ ok: true });
  }

  function scheduleMalePeerReply(userMsg) {
    var activeMalePeers = state.malePeers.filter(function (p) {
      return !p.isBanned && (!p.mutedUntil || p.mutedUntil < Date.now());
    });
    if (activeMalePeers.length === 0) return;
    var peer = activeMalePeers[Math.floor(Math.random() * activeMalePeers.length)];

    setTimeout(function () {
      var useSticker = userMsg.type === "sticker" || Math.random() < 0.38;
      var replyMsg;
      if (useSticker) {
        var st = BUILTIN_STICKER_ITEMS[Math.floor(Math.random() * BUILTIN_STICKER_ITEMS.length)];
        replyMsg = {
          id: Date.now() + Math.floor(Math.random() * 100),
          sender: peer.name,
          senderDeviceId: peer.deviceId,
          senderAvatarUrl: peer.avatarUrl,
          senderOs: peer.os,
          senderStatus: "active",
          text: st.alt,
          type: "sticker",
          stickerMeta: {
            packId: "starter-office-animals",
            stickerId: st.stickerId,
            url: st.url,
            alt: st.alt,
          },
          time: nowTimeStr(),
          createdAt: Date.now(),
          isRead: 1,
          readAt: Date.now(),
        };
      } else {
        var texts = [
          "รับทราบครับผม! ระบบจำลองใน RAM ทำงานลื่นมากครับ 👍",
          "เช็กไฟล์ในระบบแลนเรียบร้อยครับ ถ้าต้องการส่งไฟล์ตรงกดปุ่ม Send ข้างชื่อผมได้เลยนะ ⚡",
          "เยี่ยมเลยครับ! ลองกดเข้าไปดูหน้า Admin มุมขวาบนได้นะ ไม่ต้องใส่รหัสผ่านก็กดเข้าได้เลยครับ 🛡️",
          "โอเคจัดไปครับทีม! เดี๋ยวผมซิงก์งานต่อให้ครับ 🚀",
        ];
        replyMsg = {
          id: Date.now() + Math.floor(Math.random() * 100),
          sender: peer.name,
          senderDeviceId: peer.deviceId,
          senderAvatarUrl: peer.avatarUrl,
          senderOs: peer.os,
          senderStatus: "active",
          text: texts[Math.floor(Math.random() * texts.length)],
          type: "text",
          time: nowTimeStr(),
          createdAt: Date.now(),
          isRead: 1,
          readAt: Date.now(),
        };
      }
      state.messages.push(replyMsg);
      saveVolatileState();
      broadcastSocketEvent("receive_message", replyMsg);
    }, 1500);
  }

  // Simulate one of the 3 male peers sending a P2P file TO US (opens the REAL P2PReceiveModal!)
  var lastIncomingSimFile = {
    name: "LAN_Network_Blueprint_v3.2.png",
    size: 524288,
    type: "image/png",
  };

  window.__triggerIncomingP2PDemo = function (peerIdx) {
    var peer = state.malePeers[peerIdx || 0] || state.malePeers[0];
    broadcastSocketEvent("webrtc_signaling", {
      type: "transfer_request",
      senderDeviceId: peer.deviceId,
      senderIp: peer.ip,
      senderName: peer.name,
      payload: {
        files: [{ name: lastIncomingSimFile.name, size: lastIncomingSimFile.size }],
        totalSize: lastIncomingSimFile.size,
      },
    });
  };

  function simulateIncomingRelayChunksToClient(sock, peer) {
    var transferId = "inc_demo_" + Date.now();
    var totalBytes = lastIncomingSimFile.size;
    var chunkSize = 32768; // 32 KB -> 16 steps for 512 KB
    var totalSteps = Math.ceil(totalBytes / chunkSize);
    var step = 0;

    sock._trigger("direct_relay", {
      senderDeviceId: peer.deviceId,
      senderIp: peer.ip,
      senderName: peer.name,
      relayType: "file_header",
      id: transferId,
      fileName: lastIncomingSimFile.name,
      fileSize: totalBytes,
      fileType: lastIncomingSimFile.type,
    });

    var timer = setInterval(function () {
      step++;
      var dummyBuf = new Uint8Array(chunkSize).buffer;
      sock._trigger("direct_relay", {
        senderDeviceId: peer.deviceId,
        senderIp: peer.ip,
        senderName: peer.name,
        relayType: "file_chunk",
        id: transferId,
        chunk: dummyBuf,
      });

      if (step >= totalSteps) {
        clearInterval(timer);
        setTimeout(function () {
          sock._trigger("direct_relay", {
            senderDeviceId: peer.deviceId,
            senderIp: peer.ip,
            senderName: peer.name,
            relayType: "file_end",
            id: transferId,
          });
          showProtoBannerToast("🎉 รับไฟล์จำลองจาก " + peer.name + " สำเร็จ 100% (ทำงานใน RAM ไม่เขียนลงดิสก์)!", "#10b981");
        }, 120);
      }
    }, 110);
  }

  // Prevent automatic browser disk downloads when finalizeReceiveFile clicks <a download>
  window.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!a) return;

      // Intercept download links so we never dump files onto the visitor's PC
      if (a.hasAttribute("download")) {
        e.preventDefault();
        e.stopPropagation();
        var dlName = a.getAttribute("download") || "Simulated_File";
        showProtoBannerToast("🔒 จำลองดาวน์โหลด \"" + dlName + "\" สำเร็จใน RAM (ไม่บันทึกไฟล์จริงลงเครื่องเพื่อความปลอดภัย)", "#10b981");
        return;
      }

      // Intercept Next.js <Link href="/admin"> and <Link href="/"> so static pages switch cleanly
      var href = a.getAttribute("href");
      if (href === "/admin" || href === "/admin/") {
        e.preventDefault();
        e.stopImmediatePropagation();
        saveVolatileState();
        window.location.href = (BASE_PATH || "") + "/admin/";
        return;
      }
      if (href === "/") {
        e.preventDefault();
        e.stopImmediatePropagation();
        saveVolatileState();
        window.location.href = (BASE_PATH || "") + "/";
        return;
      }
    },
    true
  );

  // 4. Intercept <input type="file">.click() -> Open Figma-Style Simulated Upload Popup!
  var SIMULATED_PICKER_ASSETS = [
    {
      id: "sim-1",
      name: "Showcase_Desktop_UI_v3.2.png",
      mime: "image/png",
      sizeLabel: "420 KB",
      p2pBytes: 524288,
      desc: "ภาพหน้าจอระบบแชทหลัก LAN Share Chat (จาก docs/media)",
      url: resolveAssetUrl("/media/showcase-desktop.png"),
    },
    {
      id: "sim-2",
      name: "Admin_Governance_Dashboard.png",
      mime: "image/png",
      sizeLabel: "380 KB",
      p2pBytes: 524288,
      desc: "ภาพหน้าจอระบบผู้ดูแล 9 แท็บ (จาก docs/media)",
      url: resolveAssetUrl("/media/showcase-admin.png"),
    },
    {
      id: "sim-3",
      name: "iPad_Ultrawide_Workspace.png",
      mime: "image/png",
      sizeLabel: "310 KB",
      p2pBytes: 524288,
      desc: "ภาพหน้าจอโหมด iPad & Ultrawide (จาก docs/media)",
      url: resolveAssetUrl("/media/showcase-ipad.png"),
    },
    {
      id: "sim-4",
      name: "Mobile_Portrait_Preview.png",
      mime: "image/png",
      sizeLabel: "260 KB",
      p2pBytes: 524288,
      desc: "ภาพหน้าจอมือถือแนวตั้ง (จาก docs/media)",
      url: resolveAssetUrl("/media/showcase-mobile.png"),
    },
  ];

  var origInputClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === "file") {
      openFigmaSimulatedFilePicker(this);
      return;
    }
    return origInputClick.apply(this, arguments);
  };

  // Also mock navigator.mediaDevices.getUserMedia so clicking the Camera button (📷) renders a simulated animated canvas stream!
  if (typeof navigator !== "undefined") {
    if (!navigator.mediaDevices) navigator.mediaDevices = {};
    navigator.mediaDevices.getUserMedia = function (constraints) {
      if (constraints && constraints.video) {
        var cvs = document.createElement("canvas");
        cvs.width = 640;
        cvs.height = 480;
        var ctx = cvs.getContext("2d");
        var frame = 0;
        var animId = setInterval(function () {
          frame++;
          var grad = ctx.createLinearGradient(0, 0, 640, 480);
          grad.addColorStop(0, "#0f172a");
          grad.addColorStop(1, "#1e3a8a");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 640, 480);
          ctx.fillStyle = "rgba(59,130,246,0.22)";
          ctx.beginPath();
          ctx.arc(320 + Math.sin(frame * 0.08) * 90, 220, 110, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 26px sans-serif";
          ctx.fillText("📸 กล้องจำลอง (Simulated Lab Camera)", 85, 195);
          ctx.fillStyle = "#93c5fd";
          ctx.font = "18px sans-serif";
          ctx.fillText("ปลอดภัย 100% — ไม่ได้เปิดกล้องจริงของเครื่องคุณ", 110, 235);
          ctx.fillStyle = "#34d399";
          ctx.font = "bold 16px monospace";
          ctx.fillText("● REC RAM DEMO • " + new Date().toLocaleTimeString(), 185, 285);
        }, 66);
        var stream = cvs.captureStream ? cvs.captureStream(15) : new MediaStream();
        stream.getTracks().forEach(function (t) {
          var origStop = t.stop.bind(t);
          t.stop = function () {
            clearInterval(animId);
            origStop();
          };
        });
        return Promise.resolve(stream);
      }
      return Promise.reject(new Error("Demo mode: microphone simulation active"));
    };
  }

  async function buildSimulatedFileFromAsset(asset, padForP2P) {
    var blob;
    try {
      var res = await origFetch(asset.url);
      blob = await res.blob();
    } catch (e) {
      blob = new Blob(["Simulated File Content"], { type: asset.mime });
    }
    if (padForP2P && blob.size < asset.p2pBytes) {
      // Pad blob to ~512KB so P2P 32KB chunk progress bar animates smoothly through 16 steps!
      var pad = new Uint8Array(asset.p2pBytes - blob.size);
      blob = new Blob([blob, pad], { type: asset.mime });
    }
    return new File([blob], asset.name, { type: asset.mime, lastModified: Date.now() });
  }

  function openFigmaSimulatedFilePicker(targetInput) {
    var existing = document.getElementById("figmaSimFileModal");
    if (existing) existing.remove();

    var isP2PModalOpen = Boolean(document.querySelector('[data-testid="p2p-send-modal"]') || document.body.innerText.indexOf("Direct P2P") !== -1);
    var selectedAsset = SIMULATED_PICKER_ASSETS[0];

    var overlay = document.createElement("div");
    overlay.id = "figmaSimFileModal";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,0.68);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:sans-serif;";

    overlay.innerHTML =
      '<div style="background:#ffffff;color:#0f172a;border-radius:18px;max-width:520px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,0.3);overflow:hidden;border:1px solid #e2e8f0;">' +
      '  <div style="padding:16px 20px;background:#0f172a;color:#ffffff;display:flex;align-items:center;justify-content:space-between;">' +
      '    <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;">' +
      '      <span>📤 ป๊อปอัปจำลองเลือกไฟล์/รูปภาพ (Figma-Style Demo)</span>' +
      "    </div>" +
      '    <button id="figmaSimCloseBtn" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;">✕</button>' +
      "  </div>" +
      '  <div style="padding:18px 20px;">' +
      '    <div style="background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:10px 12px;border-radius:10px;font-size:12.5px;font-weight:600;margin-bottom:14px;">' +
      "      🔒 <strong>ปลอดภัย 100% (No Local File Access):</strong> ระบบจำลองนี้ไม่เปิดหน้าต่างดึงไฟล์จริงจากเครื่องของคุณ คลิกเลือกรูปตัวอย่างในโปรเจกต์ด้านล่างเพื่อจำลองการอัปโหลดหรือส่ง P2P ได้เลยครับ" +
      "    </div>" +
      '    <div id="figmaSimAssetsList" style="display:flex;flex-direction:column;gap:8px;">' +
      SIMULATED_PICKER_ASSETS.map(function (a, i) {
        return (
          '<div data-asset-id="' +
          a.id +
          '" class="figma-sim-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:12px;border:2px solid ' +
          (i === 0 ? "#2563eb" : "#e2e8f0") +
          ";background:" +
          (i === 0 ? "#eff6ff" : "#f8fafc") +
          ';cursor:pointer;transition:all 0.15s;">' +
          '  <div style="display:flex;align-items:center;gap:12px;">' +
          '    <img src="' +
          a.url +
          '" style="width:58px;height:42px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1;" />' +
          "    <div>" +
          '      <div style="font-size:13.5px;font-weight:700;color:#0f172a;">' +
          a.name +
          "</div>" +
          '      <div style="font-size:11.5px;color:#64748b;">' +
          a.desc +
          " (" +
          a.sizeLabel +
          ")</div>" +
          "    </div>" +
          "  </div>" +
          '  <span style="font-size:11px;font-weight:700;color:#2563eb;background:#dbeafe;padding:3px 9px;border-radius:999px;">คลิกเลือก</span>' +
          "</div>"
        );
      }).join("") +
      "    </div>" +
      "  </div>" +
      '  <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">' +
      '    <button id="figmaSimCancelBtn" style="padding:8px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;color:#334155;font-size:13px;font-weight:600;cursor:pointer;">ยกเลิก</button>' +
      '    <button id="figmaSimStageBtn" style="padding:8px 16px;border-radius:10px;border:none;background:#2563eb;color:#ffffff;font-size:13px;font-weight:700;cursor:pointer;">⚡ เลือกไฟล์จำลองนี้ (Auto-Upload)</button>' +
      "  </div>" +
      "</div>";

    document.body.appendChild(overlay);

    var itemEls = overlay.querySelectorAll(".figma-sim-item");
    itemEls.forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-asset-id");
        selectedAsset =
          SIMULATED_PICKER_ASSETS.find(function (x) {
            return x.id === id;
          }) || SIMULATED_PICKER_ASSETS[0];
        itemEls.forEach(function (other) {
          var active = other.getAttribute("data-asset-id") === selectedAsset.id;
          other.style.borderColor = active ? "#2563eb" : "#e2e8f0";
          other.style.background = active ? "#eff6ff" : "#f8fafc";
        });
      });
    });

    function closePicker() {
      overlay.remove();
    }

    overlay.querySelector("#figmaSimCloseBtn").addEventListener("click", closePicker);
    overlay.querySelector("#figmaSimCancelBtn").addEventListener("click", closePicker);

    overlay.querySelector("#figmaSimStageBtn").addEventListener("click", async function () {
      var btn = overlay.querySelector("#figmaSimStageBtn");
      btn.textContent = "⏳ กำลังเตรียมไฟล์จำลองใน RAM...";
      btn.disabled = true;

      var simFile = await buildSimulatedFileFromAsset(selectedAsset, true);
      try {
        var dt = new DataTransfer();
        dt.items.add(simFile);
        Object.defineProperty(targetInput, "files", {
          value: dt.files,
          writable: true,
          configurable: true,
        });
      } catch (e) {}

      var ev = new Event("change", { bubbles: true });
      targetInput.dispatchEvent(ev);
      closePicker();

      // If this was triggered from the main chat composer (not inside P2P modal), auto-click Send so it auto-uploads 0% -> 100%!
      setTimeout(function () {
        var sendBtn = document.querySelector('[data-testid="chat-send-btn"]');
        var p2pSendBtn = document.querySelector('[data-testid="p2p-start-send-btn"]');
        if (sendBtn && !sendBtn.disabled && !document.querySelector('[data-testid="p2p-send-modal"]')) {
          sendBtn.click();
        }
      }, 220);
    });
  }

  // 5. Intercept window.fetch & XMLHttpRequest for all /api/* routes
  var origFetch = window.fetch.bind(window);

  function jsonResponse(obj, status) {
    return Promise.resolve(
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  window.fetch = async function (input, init) {
    var urlStr = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    var method = (init && init.method ? init.method : "GET").toUpperCase();

    // Parse pathname relative to origin
    var path = urlStr;
    try {
      if (urlStr.indexOf("http") === 0) {
        var u = new URL(urlStr);
        path = u.pathname + u.search;
      }
    } catch (e) {}

    if (BASE_PATH && path.indexOf(BASE_PATH + "/api/") === 0) {
      path = path.slice(BASE_PATH.length);
    }

    if (path.indexOf("/api/") === 0) {
      return handleMockApiRequest(path, method, init);
    }

    // Rewrite root-relative static assets when hosted under a GitHub Pages subpath
    if (BASE_PATH && typeof input === "string") {
      input = resolveAssetUrl(input);
    }
    return origFetch(input, init);
  };

  // Also intercept XMLHttpRequest for /api/upload and /api/admin/upload_file (simulates smooth 0% -> 100% upload progress!)
  var OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    var xhr = new OrigXHR();
    var mockUrl = "";
    var mockMethod = "GET";
    var origOpen = xhr.open.bind(xhr);
    var origSend = xhr.send.bind(xhr);
    var reqHeaders = {};

    xhr.open = function (m, u) {
      mockMethod = (m || "GET").toUpperCase();
      mockUrl = String(u || "");
      return origOpen.apply(xhr, arguments);
    };

    var origSetHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function (k, v) {
      reqHeaders[k.toLowerCase()] = v;
      try {
        return origSetHeader(k, v);
      } catch (e) {}
    };

    xhr.send = function (body) {
      if (mockUrl.indexOf("/api/upload") !== -1 || mockUrl.indexOf("/api/admin/upload_file") !== -1) {
        simulateXhrUpload(xhr, mockUrl, body, reqHeaders);
        return;
      }
      return origSend(body);
    };

    return xhr;
  };

  function simulateXhrUpload(xhr, url, formData, headers) {
    var pct = 0;
    var timer = setInterval(function () {
      pct = Math.min(100, pct + 25);
      if (xhr.upload && typeof xhr.upload.onprogress === "function") {
        xhr.upload.onprogress({ lengthComputable: true, loaded: pct, total: 100 });
      }
      if (pct >= 100) {
        clearInterval(timer);
        finalizeSimulatedUpload(formData, url.indexOf("admin") !== -1).then(function (respObj) {
          Object.defineProperty(xhr, "status", { value: 200, configurable: true });
          Object.defineProperty(xhr, "responseText", { value: JSON.stringify(respObj), configurable: true });
          if (typeof xhr.onload === "function") xhr.onload();
        });
      }
    }, 140);
  }

  async function finalizeSimulatedUpload(formData, isAdminUpload) {
    var files = [];
    if (formData && typeof formData.getAll === "function") {
      files = formData.getAll("files");
    }
    if (!files || files.length === 0) {
      var fallbackFile = await buildSimulatedFileFromAsset(SIMULATED_PICKER_ASSETS[0], false);
      files = [fallbackFile];
    }

    var caption = formData && typeof formData.get === "function" ? String(formData.get("caption") || "") : "";
    var attachments = [];

    files.forEach(function (f, idx) {
      var token = "tok_ram_" + Date.now() + "_" + idx;
      mediaBlobStore.set(token, f);
      var fileId = state.adminFiles.length + 1 + idx;
      attachments.push({
        fileId: fileId,
        fileName: f.name || "Simulated_Upload.png",
        fileSize: f.size || 420000,
        mimeType: f.type || "image/png",
        mediaToken: token,
      });
      state.adminFiles.unshift({
        id: fileId,
        originalName: f.name || "Simulated_Upload.png",
        storedName: "ram_" + token + ".bin",
        mimeType: f.type || "image/png",
        fileSize: f.size || 420000,
        sender: isAdminUpload ? "Admin" : state.myIdentity.name,
        senderIp: state.myIdentity.ip,
        uploadedAt: new Date().toISOString(),
        mediaToken: token,
      });
    });

    var msgId = Date.now() + Math.floor(Math.random() * 100);
    var newMsg = {
      id: msgId,
      sender: isAdminUpload ? "Admin" : state.myIdentity.name,
      senderDeviceId: isAdminUpload ? "admin_console" : state.myIdentity.deviceId,
      senderAvatarUrl: isAdminUpload ? state.systemSettings.adminAvatarUrl : state.myIdentity.avatarUrl,
      senderOs: state.myIdentity.os,
      senderStatus: "active",
      isAdmin: isAdminUpload ? 1 : 0,
      text: caption,
      type: "file",
      fileName: attachments[0].fileName,
      fileSize: attachments[0].fileSize,
      mimeType: attachments[0].mimeType,
      mediaToken: attachments[0].mediaToken,
      attachments: attachments,
      time: nowTimeStr(),
      createdAt: Date.now(),
      isRead: 1,
      readAt: Date.now(),
    };

    state.messages.push(newMsg);
    addAuditLog("UPLOAD_FILE", newMsg.sender, state.myIdentity.ip, {
      originalName: attachments[0].fileName,
      count: attachments.length,
    });
    saveVolatileState();
    broadcastSocketEvent("receive_message", newMsg);
    showProtoBannerToast("✅ จำลองอัปโหลด \"" + attachments[0].fileName + "\" เข้าห้องแชทและ Admin Vault สำเร็จ!", "#10b981");
    scheduleMalePeerReply(newMsg);

    return { ok: true, message: newMsg };
  }

  // Chunked upload staging store for >2MB files
  var chunkUploadStore = new Map();

  async function handleMockApiRequest(path, method, init) {
    var cleanPath = path.split("?")[0];
    var bodyObj = {};
    if (init && init.body && typeof init.body === "string") {
      try {
        bodyObj = JSON.parse(init.body);
      } catch (e) {}
    }

    // 1. Runtime Config & Server Info
    if (cleanPath === "/api/config" || cleanPath === "/api/server-info") {
      return jsonResponse({
        maxChatFileSizeMb: 1024,
        maxChatFileBytes: 1024 * 1024 * 1024,
        maxP2pFileSizeMb: 1024,
        maxP2pFileBytes: 1024 * 1024 * 1024,
        maxChatFilesBatch: 10,
        minStickersPerPack: 1,
        recommendedStickersPerPack: 16,
        maxStickersPerPack: 40,
        videoTranscodeAvailable: true,
        avatarPresets: AVATAR_PRESETS,
        settings: state.systemSettings,
      });
    }

    // 2. Stickers
    if (cleanPath === "/api/stickers" || cleanPath === "/api/admin/stickers") {
      return jsonResponse({
        packs: state.stickerPacks,
        limits: { min: 1, recommended: 16, max: 40 },
      });
    }

    // 3. Encrypted Media Fetch & Thumbnail (returns real project PNG or RAM Blob!)
    if (cleanPath === "/api/media/fetch" || cleanPath === "/api/media/thumb") {
      var tok = bodyObj.token || "";
      if (mediaBlobStore.has(tok)) {
        var b = mediaBlobStore.get(tok);
        return new Response(b, { status: 200, headers: { "Content-Type": b.type || "image/png" } });
      }
      var mappedUrl = mediaUrlMapping[tok] || resolveAssetUrl("/media/showcase-desktop.png");
      try {
        var imgRes = await origFetch(mappedUrl);
        var imgBlob = await imgRes.blob();
        mediaBlobStore.set(tok, imgBlob);
        return new Response(imgBlob, { status: 200, headers: { "Content-Type": imgBlob.type || "image/png" } });
      } catch (e) {
        return new Response("", { status: 204 });
      }
    }

    if (cleanPath === "/api/media/stream-ticket" || cleanPath === "/api/media/zip-ticket") {
      return jsonResponse({
        streamUrl: resolveAssetUrl("/media/showcase-desktop.png"),
        downloadUrl: resolveAssetUrl("/media/showcase-desktop.png"),
      });
    }

    // 4. Chunked Upload endpoints (/api/upload/chunk & /api/upload/complete)
    if (cleanPath === "/api/upload/chunk" && method === "POST") {
      var headers = (init && init.headers) || {};
      var upId = headers["x-upload-id"] || "up_default";
      var fName = decodeURIComponent(headers["x-file-name"] || "Simulated_Image.png");
      var fMime = headers["x-mime-type"] || "image/png";
      if (!chunkUploadStore.has(upId)) {
        chunkUploadStore.set(upId, { name: fName, mime: fMime, parts: [] });
      }
      chunkUploadStore.get(upId).parts.push(init.body);
      return jsonResponse({ ok: true });
    }

    if (cleanPath === "/api/upload/complete" && method === "POST") {
      var upIds = bodyObj.uploadIds || [];
      var fd = new FormData();
      for (var i = 0; i < upIds.length; i++) {
        var info = chunkUploadStore.get(upIds[i]);
        if (info) {
          var mergedBlob = new Blob(info.parts, { type: info.mime });
          fd.append("files", new File([mergedBlob], info.name, { type: info.mime }));
          chunkUploadStore.delete(upIds[i]);
        }
      }
      var resData = await finalizeSimulatedUpload(fd, false);
      return jsonResponse(resData);
    }

    if (cleanPath === "/api/upload" && method === "POST") {
      var resUp = await finalizeSimulatedUpload(init ? init.body : null, false);
      return jsonResponse(resUp);
    }

    // 5. Profile Update
    if (cleanPath === "/api/profile" || cleanPath === "/api/profile/name" || cleanPath === "/api/profile/avatar") {
      if (bodyObj.name) state.myIdentity.name = bodyObj.name;
      if (bodyObj.avatarUrl) state.myIdentity.avatarUrl = resolveAssetUrl(bodyObj.avatarUrl);
      if (bodyObj.imageBase64) state.myIdentity.avatarUrl = bodyObj.imageBase64;
      saveVolatileState();
      broadcastSocketEvent("identity", state.myIdentity);
      broadcastSocketEvent("device_profile_updated", {
        deviceId: state.myIdentity.deviceId,
        name: state.myIdentity.name,
        avatarUrl: state.myIdentity.avatarUrl,
      });
      broadcastSocketEvent("peers_update", getActivePeersList());
      return jsonResponse({ ok: true, identity: state.myIdentity, avatarUrl: state.myIdentity.avatarUrl });
    }

    // 6. User Message Edit & Delete
    var msgMatch = cleanPath.match(/^\/api\/messages\/(\d+)(\/request-delete)?$/);
    if (msgMatch) {
      var targetId = Number(msgMatch[1]);
      var isReqDel = Boolean(msgMatch[2]);
      if (isReqDel && method === "POST") {
        var al = {
          id: Date.now(),
          alertType: "delete_request",
          messageId: targetId,
          sender: state.myIdentity.name,
          deviceId: state.myIdentity.deviceId,
          previewText: "คำขอลบข้อความ #" + targetId,
          reason: bodyObj.reason || "ผู้ใช้ร้องขอให้แอดมินลบข้อความนี้",
          status: "pending",
          createdAt: Date.now(),
        };
        state.alerts.unshift(al);
        saveVolatileState();
        broadcastSocketEvent("admin_alert", al);
        return jsonResponse({ ok: true });
      }
      if (method === "PUT") {
        state.messages = state.messages.map(function (m) {
          if (m.id === targetId) {
            return Object.assign({}, m, {
              text: bodyObj.text || m.text,
              editedAt: Date.now(),
              editCount: (m.editCount || 0) + 1,
            });
          }
          return m;
        });
        saveVolatileState();
        broadcastSocketEvent("message_edited", {
          id: targetId,
          text: bodyObj.text,
          editedAt: Date.now(),
          editCount: 1,
          editHistory: [],
        });
        return jsonResponse({ ok: true });
      }
      if (method === "DELETE") {
        state.messages = state.messages.map(function (m) {
          return m.id === targetId ? Object.assign({}, m, { isDeleted: 1, deletedAt: Date.now(), deletedBy: "self", text: "" }) : m;
        });
        saveVolatileState();
        broadcastSocketEvent("message_soft_deleted", { id: targetId, deletedAt: Date.now(), deletedBy: "self" });
        return jsonResponse({ ok: true });
      }
    }

    // =========================================================================
    // 7. ADMIN CONSOLE API ENDPOINTS (PASSWORD BYPASS + ALL 9 TABS)
    // =========================================================================
    if (cleanPath === "/api/admin/login" && method === "POST") {
      addAuditLog("ADMIN_LOGIN", "admin", "192.168.1.2", { mode: "Demo Password Bypass" });
      return jsonResponse({
        success: true,
        token: "demo_admin_token_ram",
      });
    }

    if (cleanPath === "/api/admin/logout") {
      return jsonResponse({ success: true });
    }

    if (cleanPath === "/api/admin/overview") {
      var nowMs = Date.now();
      var todayHourly = [];
      for (var h = 0; h < 24; h++) {
        todayHourly.push({
          dayKey: new Date().toISOString().slice(0, 10),
          hour: h,
          peakOnline: h >= 8 && h <= 22 ? 4 : 1,
          messageCount: h === 9 ? state.messages.length : (h >= 8 && h <= 18 ? 3 : 0),
        });
      }
      var daily = [];
      for (var d = 6; d >= 0; d--) {
        var dt = new Date(nowMs - d * 86400000).toISOString().slice(0, 10);
        daily.push({
          dayKey: dt,
          peakOnline: 4,
          peakHour: 10,
          peakOnlineAt: nowMs - d * 86400000,
          messageCount: d === 0 ? state.messages.length : 12 + d * 2,
          uploadCount: d === 0 ? state.adminFiles.length : 4,
          uploadBytes: 1420000,
          egressBytes: 3850000,
          spamBlockedCount: 0,
          p2pBlockedCount: 0,
        });
      }
      return jsonResponse({
        serverStartedAt: nowMs - 3600000 * 5,
        uptimeSeconds: 18000,
        onlinePeersCount: getActivePeersList().length,
        totalDevices: 4,
        totalMessages: state.messages.length,
        totalFiles: state.adminFiles.length,
        totalFileBytes: state.adminFiles.reduce(function (s, f) { return s + (f.fileSize || 0); }, 0),
        pendingAlerts: state.alerts.filter(function (a) { return a.status === "pending"; }).length,
        mutedDevicesCount: state.malePeers.filter(function (p) { return p.mutedUntil && p.mutedUntil > nowMs; }).length,
        bannedDevicesCount: state.malePeers.filter(function (p) { return p.isBanned; }).length,
        bannedIpsCount: state.bannedIps.length,
        todayPeakOnline: 4,
        todayPeakHour: 10,
        todayUploadBytes: 1420000,
        todayEgressBytes: 3850000,
        totalUploadBytes: 15800000,
        totalEgressBytes: 42100000,
        daily: daily,
        todayHourly: todayHourly,
        bannedIps: state.bannedIps,
      });
    }

    if (cleanPath === "/api/admin/messages") {
      return jsonResponse({
        messages: state.messages,
        hasMore: false,
        oldestId: state.messages.length > 0 ? state.messages[0].id : null,
        totalCount: state.messages.length,
      });
    }

    if (cleanPath === "/api/admin/files") {
      return jsonResponse(state.adminFiles);
    }

    if (cleanPath === "/api/admin/devices") {
      var devicesList = [
        {
          deviceId: state.myIdentity.deviceId,
          name: state.myIdentity.name + " (เครื่องของคุณ)",
          avatarUrl: state.myIdentity.avatarUrl,
          os: state.myIdentity.os,
          browser: state.myIdentity.browser,
          lastIp: state.myIdentity.ip,
          lastSeenAt: Date.now(),
          mutedUntil: 0,
          isBanned: 0,
        },
      ].concat(
        state.malePeers.map(function (p) {
          return {
            deviceId: p.deviceId,
            name: p.name,
            avatarUrl: p.avatarUrl,
            os: p.os,
            browser: p.browser,
            lastIp: p.ip,
            lastSeenAt: Date.now() - 15000,
            mutedUntil: p.mutedUntil || 0,
            isBanned: p.isBanned || 0,
            banReason: p.banReason || "",
          };
        })
      );
      return jsonResponse({
        devices: devicesList,
        bannedIps: state.bannedIps,
        callerIp: state.myIdentity.ip,
        callerDeviceId: state.myIdentity.deviceId,
      });
    }

    if (cleanPath === "/api/admin/presence") {
      var pMap = {};
      pMap[state.myIdentity.deviceId] = "online";
      state.malePeers.forEach(function (p) {
        pMap[p.deviceId] = p.isBanned ? "offline" : "online";
      });
      return jsonResponse(pMap);
    }

    if (cleanPath === "/api/admin/alerts") {
      return jsonResponse(state.alerts);
    }

    if (cleanPath === "/api/admin/logs") {
      return jsonResponse(state.logs);
    }

    if (cleanPath === "/api/admin/settings") {
      if (method === "PUT") {
        state.systemSettings = Object.assign({}, state.systemSettings, bodyObj);
        addAuditLog("UPDATE_SETTINGS", "admin", "192.168.1.2", state.systemSettings);
        saveVolatileState();
        broadcastSocketEvent("settings_update", state.systemSettings);
      }
      return jsonResponse(state.systemSettings);
    }

    if (cleanPath === "/api/admin/env-status" || cleanPath === "/api/admin/env-logs" || cleanPath === "/api/admin/env-clear-cache") {
      return jsonResponse({
        readOnly: true,
        ffmpeg: {
          available: true,
          source: "system_path",
          version: "ffmpeg version 7.1-essentials_build (Simulated RAM Mode)",
          errorDetail: null,
        },
        missingCount: 0,
        items: [
          { key: "ADMIN_PASSWORD", label: "Admin Console Password", category: "security", status: "ok", valuePreview: "•••••••• (Demo Bypass Active)", hint: "Configured" },
          { key: "MEDIA_SECRET", label: "AES-256-GCM Media Encryption Key", category: "security", status: "ok", valuePreview: "64-hex key active", hint: "Configured" },
          { key: "FFMPEG_PATH", label: "FFmpeg H.264 / MP3 Transcoder", category: "media", status: "ok", valuePreview: "/usr/bin/ffmpeg", hint: "Available" },
          { key: "MAX_CHAT_FILE_SIZE_MB", label: "Max Chat File Upload Size", category: "runtime", status: "ok", valuePreview: "1024 MB", hint: "Configured" },
        ],
        envLogs: [],
        purged: { freedMb: 12.4, deletedFiles: 8 },
        runtime: {
          executionMode: "docker",
          platform: "linux",
          platformLabel: "Docker Alpine / Interactive RAM Prototype",
          nodeVersion: "v22.14.0",
          minDiskFreeMb: 512,
          diskFreeMb: 48200,
          diskTotalGb: 64,
          diskUsedPercent: 18,
          isolatedVolumesCount: 6,
          maxTotalGb: 64,
          totalUsedMb: 48.5,
          zones: [
            { id: "db", label: "SQLite WAL Database (RAM Mock)", path: "/app/storage/db", writable: true, usedMb: 2.1, freeMb: 48200, totalGb: 64, distinctMount: true, quotaMb: 1024, quotaPercent: 0.2 },
            { id: "uploads", label: "Encrypted Uploads (AES-256-GCM)", path: "/app/storage/uploads", writable: true, usedMb: 18.4, freeMb: 48200, totalGb: 64, distinctMount: true, quotaMb: 20480, quotaPercent: 0.9 },
            { id: "stickers", label: "Sticker Packs Vault", path: "/app/storage/stickers", writable: true, usedMb: 4.2, freeMb: 48200, totalGb: 64, distinctMount: true, quotaMb: 2048, quotaPercent: 0.2 },
            { id: "avatars", label: "Custom Avatars", path: "/app/storage/avatars", writable: true, usedMb: 1.5, freeMb: 48200, totalGb: 64, distinctMount: true, quotaMb: 1024, quotaPercent: 0.1 },
            { id: "cache", label: "Thumbnail & Transcode Cache", path: "/app/storage/cache", writable: true, usedMb: 22.3, freeMb: 48200, totalGb: 64, distinctMount: true, quotaMb: 8192, quotaPercent: 0.3 },
            { id: "chunks", label: "Temporary Upload Chunks", path: "/app/storage/chunks", writable: true, usedMb: 0, freeMb: 48200, totalGb: 64, distinctMount: true, quotaMb: 10240, quotaPercent: 0 },
          ],
        },
      });
    }

    if (cleanPath === "/api/admin/send_message" && method === "POST") {
      var admMsg = {
        id: Date.now(),
        sender: "ผู้ดูแลระบบ (Admin)",
        senderDeviceId: "admin_console",
        senderAvatarUrl: state.systemSettings.adminAvatarUrl,
        senderStatus: "active",
        isAdmin: 1,
        text: bodyObj.text || (bodyObj.stickerMeta ? bodyObj.stickerMeta.alt : ""),
        type: bodyObj.type || "text",
        stickerMeta: bodyObj.stickerMeta || null,
        time: nowTimeStr(),
        createdAt: Date.now(),
        isRead: 1,
        readAt: Date.now(),
      };
      state.messages.push(admMsg);
      addAuditLog("ADMIN_MESSAGE", "admin", "192.168.1.2", { text: admMsg.text });
      saveVolatileState();
      broadcastSocketEvent("receive_message", admMsg);
      return jsonResponse({ ok: true, message: admMsg });
    }

    // Admin Delete Message / Batch Delete
    var admMsgDel = cleanPath.match(/^\/api\/admin\/message\/(\d+)$/);
    if (admMsgDel && method === "DELETE") {
      var delId = Number(admMsgDel[1]);
      state.messages = state.messages.filter(function (m) { return m.id !== delId; });
      saveVolatileState();
      broadcastSocketEvent("message_deleted", { id: delId });
      return jsonResponse({ ok: true });
    }

    if (cleanPath === "/api/admin/messages/batch-delete" && method === "POST") {
      var ids = bodyObj.ids || [];
      state.messages = state.messages.filter(function (m) { return ids.indexOf(m.id) === -1; });
      saveVolatileState();
      broadcastSocketEvent("messages_batch_deleted", { ids: ids });
      return jsonResponse({ ok: true, deletedCount: ids.length });
    }

    // Admin Delete File / Batch Delete Files
    var admFileDel = cleanPath.match(/^\/api\/admin\/file\/(\d+)$/);
    if (admFileDel && method === "DELETE") {
      var fId = Number(admFileDel[1]);
      state.adminFiles = state.adminFiles.filter(function (f) { return f.id !== fId; });
      addAuditLog("DELETE_FILE", "admin", "192.168.1.2", { id: fId });
      saveVolatileState();
      return jsonResponse({ ok: true });
    }

    if (cleanPath === "/api/admin/files/batch-delete" && method === "POST") {
      var fIds = bodyObj.ids || [];
      state.adminFiles = state.adminFiles.filter(function (f) { return fIds.indexOf(f.id) === -1; });
      addAuditLog("BATCH_DELETE_FILES", "admin", "192.168.1.2", { count: fIds.length });
      saveVolatileState();
      return jsonResponse({ ok: true, deletedCount: fIds.length });
    }

    // Admin Device Governance (Mute / Ban / Rename / Random Alias / Delete)
    var devActionMatch = cleanPath.match(/^\/api\/admin\/device\/([^\/]+)(?:\/(mute|ban|name|generate-name))?$/);
    if (devActionMatch) {
      var devId = decodeURIComponent(devActionMatch[1]);
      var subAction = devActionMatch[2] || "";
      var targetDev = state.malePeers.find(function (p) { return p.deviceId === devId; });

      if (targetDev) {
        if (subAction === "mute") {
          var mins = Number(bodyObj.minutes) || 0;
          targetDev.mutedUntil = mins > 0 ? Date.now() + mins * 60000 : 0;
          addAuditLog(mins > 0 ? "MUTE_DEVICE" : "UNMUTE_DEVICE", "admin", "192.168.1.2", { deviceId: devId, name: targetDev.name });
        } else if (subAction === "ban") {
          targetDev.isBanned = bodyObj.banned ? 1 : 0;
          targetDev.banReason = bodyObj.reason || "";
          addAuditLog(targetDev.isBanned ? "BAN_DEVICE" : "UNBAN_DEVICE", "admin", "192.168.1.2", { deviceId: devId, name: targetDev.name });
        } else if (subAction === "name") {
          targetDev.name = bodyObj.name || targetDev.name;
        } else if (subAction === "generate-name") {
          var preset = AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
          targetDev.name = preset.name + "_" + Math.floor(100 + Math.random() * 899);
          targetDev.avatarUrl = preset.url;
        } else if (method === "DELETE") {
          state.malePeers = state.malePeers.filter(function (p) { return p.deviceId !== devId; });
        }
        saveVolatileState();
        broadcastSocketEvent("peers_update", getActivePeersList());
      }
      return jsonResponse({ ok: true, name: targetDev ? targetDev.name : "" });
    }

    // Admin Alerts Resolve
    var alertMatch = cleanPath.match(/^\/api\/admin\/alerts\/(\d+)\/resolve$/);
    if (alertMatch && method === "POST") {
      var alId = Number(alertMatch[1]);
      state.alerts = state.alerts.map(function (a) {
        return a.id === alId ? Object.assign({}, a, { status: "resolved" }) : a;
      });
      saveVolatileState();
      return jsonResponse({ ok: true });
    }

    if (cleanPath === "/api/admin/alerts/resolve-all") {
      state.alerts = state.alerts.map(function (a) { return Object.assign({}, a, { status: "resolved" }); });
      saveVolatileState();
      return jsonResponse({ ok: true, resolvedCount: state.alerts.length });
    }

    // Admin Reset
    if (cleanPath === "/api/admin/reset" && method === "POST") {
      state = createDefaultState();
      window.__LAN_DEMO_STATE__ = state;
      saveVolatileState();
      return jsonResponse({ ok: true, settings: state.systemSettings });
    }

    return jsonResponse({ ok: true });
  }

  // 6. Floating Prototype Quick-Bar (Switch Chat / Webboard Overlay / Admin + Trigger Incoming P2P)
  function showProtoBannerToast(text, bg) {
    var old = document.getElementById("lanProtoToast");
    if (old) old.remove();
    var el = document.createElement("div");
    el.id = "lanProtoToast";
    el.style.cssText =
      "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99998;background:" +
      (bg || "#1e293b") +
      ";color:#ffffff;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:700;box-shadow:0 10px 25px rgba(0,0,0,0.25);display:flex;align-items:center;gap:8px;font-family:sans-serif;pointer-events:none;";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.remove();
    }, 3600);
  }

  function openWebboardOverlayModal() {
    var existing = document.getElementById("lanWebboardOverlay");
    if (existing) {
      existing.remove();
      return;
    }

    var wrap = document.createElement("div");
    wrap.id = "lanWebboardOverlay";
    wrap.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,0.72);backdrop-filter:blur(5px);z-index:99990;display:flex;align-items:center;justify-content:center;padding:20px;font-family:sans-serif;";

    function renderBoardHtml() {
      return (
        '<div style="background:#f8fafc;color:#0f172a;border-radius:20px;max-width:980px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.35);overflow:hidden;border:1px solid #cbd5e1;">' +
        '  <div style="padding:18px 24px;background:#0f172a;color:#ffffff;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">' +
        "    <div>" +
        '      <div style="display:flex;align-items:center;gap:8px;">' +
        '        <span style="font-size:18px;font-weight:800;">📌 กระดาน Webboard แชร์ไฟล์ในวงแลน (Simulated LAN Board)</span>' +
        '        <span style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;">100% RAM Simulation</span>' +
        "      </div>" +
        '      <div style="font-size:12px;color:#94a3b8;margin-top:3px;">กระทู้ประกาศและไฟล์จากเพื่อนร่วมทีมผู้ชายทั้ง 3 เครื่อง • กดจำลองโพสต์กระทู้หรือจำลองดาวน์โหลดไฟล์ได้ทันที</div>' +
        "    </div>" +
        '    <div style="display:flex;gap:8px;">' +
        '      <button id="wbAddPostBtn" style="background:#2563eb;color:#ffffff;border:none;padding:8px 14px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;">＋ จำลองสร้างกระทู้ / แนบรูปอัตโนมัติ</button>' +
        '      <button id="wbCloseBtn" style="background:#1e293b;color:#cbd5e1;border:1px solid #334155;padding:8px 12px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;">✕ ปิดหน้าต่าง</button>' +
        "    </div>" +
        "  </div>" +
        '  <div style="padding:20px 24px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">' +
        state.webboardPosts
          .map(function (p) {
            return (
              '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(0,0,0,0.04);">' +
              '  <img src="' +
              p.thumb +
              '" style="width:100%;height:150px;object-fit:cover;border-bottom:1px solid #f1f5f9;" />' +
              '  <div style="padding:14px;display:flex;flex-direction:column;gap:8px;flex:1;">' +
              '    <div style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:#64748b;">' +
              '      <img src="' +
              p.avatar +
              '" style="width:22px;height:22px;border-radius:50%;object-fit:cover;" />' +
              "      <strong>" +
              p.author +
              "</strong> • <span>" +
              p.time +
              "</span>" +
              "    </div>" +
              '    <div style="font-size:14.5px;font-weight:800;color:#0f172a;line-height:1.35;">' +
              p.title +
              "</div>" +
              '    <div style="font-size:12.5px;color:#475569;line-height:1.45;">' +
              p.desc +
              "</div>" +
              '    <div style="margin-top:auto;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
              '      <div style="min-width:0;">' +
              '        <div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📎 ' +
              p.fileName +
              "</div>" +
              '        <div style="font-size:11px;color:#64748b;">' +
              p.fileSize +
              " • โหลดแล้ว " +
              p.downloads +
              " ครั้ง</div>" +
              "      </div>" +
              '      <button class="wb-dl-btn" data-wb-id="' +
              p.id +
              '" style="background:#2563eb;color:#ffffff;border:none;padding:6px 11px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;flex-shrink:0;">⬇️ โหลดจำลอง</button>' +
              "    </div>" +
              "  </div>" +
              "</div>"
            );
          })
          .join("") +
        "  </div>" +
        "</div>"
      );
    }

    function bindEvents() {
      wrap.innerHTML = renderBoardHtml();
      wrap.querySelector("#wbCloseBtn").addEventListener("click", function () {
        wrap.remove();
      });
      wrap.querySelector("#wbAddPostBtn").addEventListener("click", function () {
        state.webboardPosts.unshift({
          id: "wb-" + Date.now(),
          title: "🚀 อัปเดตผลทดสอบระบบ LAN Share Chat (โพสต์จำลองใน RAM)",
          author: state.myIdentity.name + " (คุณ)",
          avatar: state.myIdentity.avatarUrl,
          role: "LAN Participant",
          time: "เมื่อสักครู่ • " + nowTimeStr() + " น.",
          desc: "สร้างกระทู้พร้อมแนบภาพจำลองอัตโนมัติโดยไม่ต้องอัปโหลดไฟล์จริงจากเครื่อง (รีเฟรชหน้าเว็บแล้วหายทันที)",
          fileName: "Simulated_Report_v3.2.png",
          fileSize: "1.4 MB",
          thumb: resolveAssetUrl("/media/showcase-desktop.png"),
          downloads: 1,
        });
        saveVolatileState();
        bindEvents();
        showProtoBannerToast("✅ จำลองอัปโหลดรูปและโพสต์กระทู้ลง Webboard สำเร็จ!", "#10b981");
      });
      wrap.querySelectorAll(".wb-dl-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-wb-id");
          var post = state.webboardPosts.find(function (x) {
            return x.id === id;
          });
          if (post) {
            post.downloads++;
            saveVolatileState();
            bindEvents();
            showProtoBannerToast("⬇️ จำลองดาวน์โหลด \"" + post.fileName + "\" (100% ใน RAM • ไม่เซฟไฟล์จริงลงคอม)", "#10b981");
          }
        });
      });
    }

    bindEvents();
    document.body.appendChild(wrap);
  }

  function mountFloatingProtoSwitcher() {
    // If running inside the Mobile or iPad simulator iframe, do not render a second floating bar inside the device screen
    if (window.location.search.indexOf("frame=") !== -1) {
      if (window.location.search.indexOf("frame=mobile") !== -1) {
        state.myIdentity.os = "iPhone";
      } else if (window.location.search.indexOf("frame=ipad") !== -1) {
        state.myIdentity.os = "iPad";
      }
      if (window.location.pathname.indexOf("/admin") !== -1) {
        setInterval(function () {
          var pwInput = document.querySelector('input[type="password"]');
          if (pwInput && !document.getElementById("adminDemoBypassHint")) {
            var hint = document.createElement("div");
            hint.id = "adminDemoBypassHint";
            hint.style.cssText =
              "margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;font-size:12px;font-weight:600;line-height:1.4;";
            hint.innerHTML =
              "💡 <strong>โหมดเดโมจำลอง:</strong> ไม่ต้องใส่รหัสผ่าน กดปุ่ม <strong>\"เข้าสู่ระบบ\"</strong> ได้เลยครับ";
            pwInput.parentNode.parentNode.insertBefore(hint, pwInput.parentNode);
          }
        }, 400);
      }
      return;
    }

    if (document.getElementById("lanFloatingProtoBar")) return;
    var isOnAdmin = window.location.pathname.indexOf("/admin") !== -1;
    var activeDeviceMode = "desktop"; // "desktop" | "ipad" | "mobile"
    var ipadPortrait = false;

    var bar = document.createElement("div");
    bar.id = "lanFloatingProtoBar";
    bar.style.cssText =
      "position:fixed;top:11px;left:56%;transform:translateX(-50%);z-index:9995;background:rgba(15,23,42,0.94);backdrop-filter:blur(8px);color:#f8fafc;padding:4px 10px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);box-shadow:0 4px 18px rgba(0,0,0,0.22);display:flex;align-items:center;gap:4px;font-family:sans-serif;font-size:11px;white-space:nowrap;flex-wrap:nowrap;justify-content:center;";

    bar.innerHTML =
      '<span style="background:rgba(16,185,129,0.2);color:#34d399;padding:3px 8px;border-radius:999px;font-weight:700;font-size:10.5px;">🔒 Demo</span>' +
      '<button id="protoGoChat" style="border:none;background:' +
      (!isOnAdmin ? "#2563eb" : "transparent") +
      ';color:#ffffff;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;">💬 แชท+P2P</button>' +
      '<button id="protoGoWebboard" style="border:none;background:transparent;color:#e2e8f0;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;">📌 Webboard</button>' +
      '<button id="protoGoAdmin" style="border:none;background:' +
      (isOnAdmin ? "#2563eb" : "transparent") +
      ';color:#ffffff;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;">🛡️ Admin</button>' +
      '<span style="color:#475569;margin:0 2px;">|</span>' +
      '<button id="protoDevDesktop" style="border:none;background:#059669;color:#ffffff;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;" title="มุมมองจอคอมพิวเตอร์">🖥️ Desktop</button>' +
      '<button id="protoDevIpad" style="border:none;background:transparent;color:#cbd5e1;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;" title="จำลองหน้าจอ iPad">📟 iPad</button>' +
      '<button id="protoDevMobile" style="border:none;background:transparent;color:#cbd5e1;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;" title="จำลองหน้าจอมือถือ (390x844)">📱 มือถือ</button>' +
      (!isOnAdmin
        ? '<button id="protoSimIncomingP2P" style="border:1px solid #8b5cf6;background:rgba(124,58,237,0.25);color:#ddd6fe;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700;cursor:pointer;margin-left:2px;">📥 เพื่อนส่ง P2P</button>'
        : "");

    document.body.appendChild(bar);

    function updateDeviceButtonsUI() {
      var dBtn = bar.querySelector("#protoDevDesktop");
      var iBtn = bar.querySelector("#protoDevIpad");
      var mBtn = bar.querySelector("#protoDevMobile");
      dBtn.style.background = activeDeviceMode === "desktop" ? "#059669" : "transparent";
      dBtn.style.color = activeDeviceMode === "desktop" ? "#ffffff" : "#cbd5e1";
      iBtn.style.background = activeDeviceMode === "ipad" ? "#059669" : "transparent";
      iBtn.style.color = activeDeviceMode === "ipad" ? "#ffffff" : "#cbd5e1";
      mBtn.style.background = activeDeviceMode === "mobile" ? "#059669" : "transparent";
      mBtn.style.color = activeDeviceMode === "mobile" ? "#ffffff" : "#cbd5e1";
    }

    function openDeviceFrameSimulator(mode) {
      activeDeviceMode = mode;
      updateDeviceButtonsUI();

      var existingStage = document.getElementById("lanDeviceFrameStage");
      if (mode === "desktop") {
        if (existingStage) existingStage.remove();
        return;
      }

      var isMobile = mode === "mobile";
      var frameW = isMobile ? 390 : ipadPortrait ? 768 : 1024;
      var frameH = isMobile ? 812 : ipadPortrait ? 860 : 740;

      // If stage and iframe already exist, resize smoothly in 0ms without reloading the iframe!
      if (existingStage) {
        var lbl = existingStage.querySelector("#lanFrameTitleLabel");
        var rotBtn = existingStage.querySelector("#rotateIpadBtn");
        var bezel = existingStage.querySelector("#lanFrameBezelBox");
        var notch = existingStage.querySelector("#lanFrameNotch");
        var ifr = existingStage.querySelector("#lanDeviceIframe");
        if (lbl) {
          lbl.innerHTML =
            "<strong>" +
            (isMobile
              ? "📱 จำลองหน้าจอมือถือ (iPhone 15 / Android • 390×844)"
              : "📟 จำลองหน้าจอ iPad (" + frameW + "×" + frameH + ")") +
            "</strong> — ใช้งานแชท, สติกเกอร์, ส่ง P2P และหน้า Admin ได้จริงทุกปุ่ม";
        }
        if (rotBtn) rotBtn.style.display = isMobile ? "none" : "inline-block";
        if (notch) notch.style.display = isMobile ? "block" : "none";
        if (bezel) {
          bezel.style.padding = isMobile ? "12px" : "14px";
          bezel.style.borderRadius = isMobile ? "44px" : "28px";
        }
        if (ifr) {
          ifr.style.width = frameW + "px";
          ifr.style.height = frameH + "px";
          ifr.style.borderRadius = isMobile ? "32px" : "18px";
        }
        return;
      }

      saveVolatileState();
      var targetRoute = isOnAdmin ? (BASE_PATH || "") + "/admin/" : (BASE_PATH || "") + "/";
      var iframeUrl = targetRoute + "?frame=" + mode;

      var stage = document.createElement("div");
      stage.id = "lanDeviceFrameStage";
      stage.style.cssText =
        "position:fixed;inset:0;background:radial-gradient(circle at center,#1e293b 0%,#0f172a 100%);z-index:9985;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 16px 16px;font-family:sans-serif;overflow:auto;";

      stage.innerHTML =
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;color:#cbd5e1;font-size:12px;">' +
        '  <span id="lanFrameTitleLabel"><strong>' +
        (isMobile ? "📱 จำลองหน้าจอมือถือ (iPhone 15 / Android • 390×844)" : "📟 จำลองหน้าจอ iPad (" + frameW + "×" + frameH + ")") +
        "</strong> — ใช้งานแชท, สติกเกอร์, ส่ง P2P และหน้า Admin ได้จริงทุกปุ่ม</span>" +
        '  <button id="rotateIpadBtn" style="display:' +
        (isMobile ? "none" : "inline-block") +
        ';background:#334155;color:#ffffff;border:1px solid #475569;padding:4px 10px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;">🔄 หมุนจอ iPad (แนวตั้ง/แนวนอน)</button>' +
        '  <button id="exitFrameBtn" style="background:#ef4444;color:#ffffff;border:none;padding:4px 10px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;">✕ กลับจอ Desktop</button>' +
        "</div>" +
        '<div id="lanFrameBezelBox" style="background:#090d16;padding:' +
        (isMobile ? "12px" : "14px") +
        ";border-radius:" +
        (isMobile ? "44px" : "28px") +
        ';border:3px solid #334155;box-shadow:0 25px 70px rgba(0,0,0,0.65);display:flex;flex-direction:column;align-items:center;max-height:calc(100vh - 110px);max-width:calc(100vw - 32px);transition:all 0.25s ease;">' +
        '  <div id="lanFrameNotch" style="display:' +
        (isMobile ? "block" : "none") +
        ';width:96px;height:18px;background:#000000;border-radius:999px;margin-bottom:8px;border:1px solid #1e293b;"></div>' +
        '  <iframe id="lanDeviceIframe" src="' +
        iframeUrl +
        '" style="width:' +
        frameW +
        "px;height:" +
        frameH +
        "px;max-height:calc(100vh - 155px);max-width:calc(100vw - 64px);border:none;border-radius:" +
        (isMobile ? "32px" : "18px") +
        ';background:#ffffff;transition:width 0.25s ease,height 0.25s ease;"></iframe>' +
        "</div>";

      document.body.appendChild(stage);

      stage.querySelector("#exitFrameBtn").addEventListener("click", function () {
        openDeviceFrameSimulator("desktop");
      });
      stage.querySelector("#rotateIpadBtn").addEventListener("click", function () {
        ipadPortrait = !ipadPortrait;
        openDeviceFrameSimulator("ipad");
      });
    }

    bar.querySelector("#protoDevDesktop").addEventListener("click", function () {
      openDeviceFrameSimulator("desktop");
    });
    bar.querySelector("#protoDevIpad").addEventListener("click", function () {
      openDeviceFrameSimulator("ipad");
    });
    bar.querySelector("#protoDevMobile").addEventListener("click", function () {
      openDeviceFrameSimulator("mobile");
    });

    bar.querySelector("#protoGoChat").addEventListener("click", function () {
      var ifr = document.getElementById("lanDeviceIframe");
      if (ifr) {
        isOnAdmin = false;
        bar.querySelector("#protoGoChat").style.background = "#2563eb";
        bar.querySelector("#protoGoAdmin").style.background = "transparent";
        ifr.src = (BASE_PATH || "") + "/?frame=" + activeDeviceMode;
        return;
      }
      if (isOnAdmin) {
        saveVolatileState();
        window.location.href = (BASE_PATH || "") + "/";
      }
    });
    bar.querySelector("#protoGoWebboard").addEventListener("click", function () {
      openWebboardOverlayModal();
    });
    bar.querySelector("#protoGoAdmin").addEventListener("click", function () {
      var ifr = document.getElementById("lanDeviceIframe");
      if (ifr) {
        isOnAdmin = true;
        bar.querySelector("#protoGoAdmin").style.background = "#2563eb";
        bar.querySelector("#protoGoChat").style.background = "transparent";
        ifr.src = (BASE_PATH || "") + "/admin/?frame=" + activeDeviceMode;
        return;
      }
      if (!isOnAdmin) {
        saveVolatileState();
        window.location.href = (BASE_PATH || "") + "/admin/";
      }
    });
    var incBtn = bar.querySelector("#protoSimIncomingP2P");
    if (incBtn) {
      incBtn.addEventListener("click", function () {
        var ifr = document.getElementById("lanDeviceIframe");
        if (ifr && ifr.contentWindow && ifr.contentWindow.__triggerIncomingP2PDemo) {
          ifr.contentWindow.__triggerIncomingP2PDemo(0);
          return;
        }
        window.__triggerIncomingP2PDemo(0);
      });
    }

    // If on /admin login screen, inject a helpful note that password is not required in demo mode
    if (isOnAdmin) {
      setInterval(function () {
        var pwInput = document.querySelector('input[type="password"]');
        if (pwInput && !document.getElementById("adminDemoBypassHint")) {
          var hint = document.createElement("div");
          hint.id = "adminDemoBypassHint";
          hint.style.cssText =
            "margin-bottom:12px;padding:10px 12px;border-radius:8px;background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;font-size:12.5px;font-weight:600;line-height:1.4;";
          hint.innerHTML =
            "💡 <strong>โหมดเดโมจำลอง (Password Bypass):</strong> ไม่ต้องใส่รหัสผ่าน (หรือใส่อะไรก็ได้) แล้วกดปุ่ม <strong>\"เข้าสู่ระบบ\"</strong> ด้านล่างเพื่อเข้าหน้า Admin ได้เลยครับ";
          pwInput.parentNode.parentNode.insertBefore(hint, pwInput.parentNode);
        }
      }, 400);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountFloatingProtoSwitcher);
  } else {
    mountFloatingProtoSwitcher();
  }
})();
