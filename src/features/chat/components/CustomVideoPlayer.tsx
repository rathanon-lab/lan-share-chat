"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  fetchMediaStreamUrl,
  getVideoTranscodeAvailable,
  isMediaGoneError,
  isMediaTokenGone,
  subscribeMediaResolved,
} from "@/lib/secureMedia";

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function CustomVideoPlayer({
  token,
  autoPlay = true,
  className = "",
}: {
  token: string;
  autoPlay?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ side: "left" | "right"; time: number } | null>(null);
  const abLoopRef = useRef<{ a: number | null; b: number | null }>({ a: null, b: null });

  const [loadedStream, setLoadedStream] = useState<{ token: string; url: string } | null>(null);
  const [failedToken, setFailedToken] = useState<string | null>(null);
  const [goneToken, setGoneToken] = useState<string | null>(null);
  const [compatUrlState, setCompatUrlState] = useState<{ token: string; url: string } | null>(null);
  const [compatTriedToken, setCompatTriedToken] = useState<string | null>(null);
  const [transcodingToken, setTranscodingToken] = useState<string | null>(null);
  const [audioOnlyToken, setAudioOnlyToken] = useState<string | null>(null);
  const [serverHasFfmpeg, setServerHasFfmpeg] = useState<boolean>(true);
  const [rotationState, setRotationState] = useState<{ token: string; deg: 0 | 90 | 180 | 270 }>({ token, deg: 0 });
  const [naturalSize, setNaturalSize] = useState<{ token: string; w: number; h: number }>({ token, w: 0, h: 0 });
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const isGone = goneToken === token || isMediaTokenGone(token);
  const rotation = rotationState.token === token ? rotationState.deg : 0;
  const videoNatW = naturalSize.token === token ? naturalSize.w : 0;
  const videoNatH = naturalSize.token === token ? naturalSize.h : 0;

  const srcUrl = isGone
    ? null
    : compatUrlState?.token === token
      ? compatUrlState.url
      : loadedStream?.token === token
        ? loadedStream.url
        : null;
  const loadError = !isGone && failedToken === token;
  const compatTried = compatTriedToken === token;
  const isTranscodingCompat = transcodingToken === token;
  const audioOnlyCodecNotice = audioOnlyToken === token;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [autoPlayMutedFallback, setAutoPlayMutedFallback] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [abLoop, setAbLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscapeVideo, setIsLandscapeVideo] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [gestureHud, setGestureHud] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    abLoopRef.current = abLoop;
  }, [abLoop]);

  useEffect(() => {
    if (!token) return;
    return subscribeMediaResolved(token, () => {
      if (isMediaTokenGone(token)) {
        if (videoRef.current) {
          try {
            videoRef.current.pause();
          } catch {}
        }
        setGoneToken(token);
      }
    });
  }, [token]);

  useEffect(() => {
    let mounted = true;
    if (isMediaTokenGone(token)) return;
    fetchMediaStreamUrl(token)
      .then((url) => {
        if (mounted) {
          setLoadedStream({ token, url });
          setFailedToken((prev) => (prev === token ? null : prev));
          setGoneToken((prev) => (prev === token ? null : prev));
        }
      })
      .catch((err) => {
        if (!mounted) return;
        if (isMediaGoneError(err)) {
          setGoneToken(token);
          setFailedToken((prev) => (prev === token ? null : prev));
        } else {
          setFailedToken(token);
        }
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize((prev) =>
        Math.abs(prev.w - rect.width) > 1 || Math.abs(prev.h - rect.height) > 1
          ? { w: rect.width, h: rect.height }
          : prev
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [srcUrl, isFullscreen, rotation]);

  const scheduleHideControls = useCallback(() => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 2800);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  const flashHud = useCallback((text: string) => {
    const k = Date.now();
    setGestureHud({ text, key: k });
    setTimeout(() => {
      setGestureHud((cur) => (cur?.key === k ? null : cur));
    }, 750);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      flashHud("▶ เล่น");
    } else {
      v.pause();
      flashHud("⏸ หยุดชั่วคราว");
    }
    revealControls();
  }, [flashHud, revealControls]);

  const seekBy = useCallback(
    (deltaSec: number) => {
      const v = videoRef.current;
      if (!v) return;
      const dur = Number.isFinite(v.duration) ? v.duration : duration;
      const next = Math.max(0, Math.min(dur || 0, v.currentTime + deltaSec));
      v.currentTime = next;
      setCurrentTime(next);
      flashHud(deltaSec > 0 ? `+${deltaSec} วินาที >>` : `<< ${deltaSec} วินาที`);
      revealControls();
    },
    [duration, flashHud, revealControls]
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !v.muted;
    v.muted = nextMuted;
    setIsMuted(nextMuted);
    setAutoPlayMutedFallback(false);
    if (!nextMuted && v.volume === 0) {
      v.volume = 0.8;
      setVolume(0.8);
    }
    revealControls();
  }, [revealControls]);

  const handleVolumeChange = useCallback(
    (nextVol: number) => {
      const v = videoRef.current;
      if (!v) return;
      const clamped = Math.max(0, Math.min(1, nextVol));
      v.volume = clamped;
      v.muted = clamped === 0;
      setVolume(clamped);
      setIsMuted(clamped === 0);
      setAutoPlayMutedFallback(false);
      revealControls();
    },
    [revealControls]
  );

  const cycleAbLoop = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setAbLoop((prev) => {
      if (prev.a === null) {
        const next = { a: v.currentTime, b: null };
        flashHud(`ตั้งจุดเริ่ม A (${formatMediaTime(v.currentTime)})`);
        return next;
      }
      if (prev.b === null) {
        if (v.currentTime > prev.a + 0.3) {
          const next = { a: prev.a, b: v.currentTime };
          v.currentTime = prev.a;
          flashHud(`ลูปช่วง ${formatMediaTime(prev.a)} - ${formatMediaTime(v.currentTime)}`);
          return next;
        }
        flashHud("จุด B ต้องมากกว่าจุด A");
        return { a: null, b: null };
      }
      flashHud("ปิดลูปช่วง A-B");
      return { a: null, b: null };
    });
    revealControls();
  }, [flashHud, revealControls]);

  const cycleSpeed = useCallback(() => {
    const rates = [1, 1.25, 1.5, 2, 0.5];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    if (videoRef.current) videoRef.current.playbackRate = next;
    setPlaybackRate(next);
    flashHud(`ความเร็ว ${next}x`);
    revealControls();
  }, [playbackRate, flashHud, revealControls]);

  const rotateVideo = useCallback(() => {
    setRotationState((prev) => {
      const cur = prev.token === token ? prev.deg : 0;
      const next = (((cur + 90) % 360) as 0 | 90 | 180 | 270);
      flashHud(next === 0 ? "มุมปกติ 0°" : `หมุน ${next}°`);
      return { token, deg: next };
    });
    revealControls();
  }, [token, flashHud, revealControls]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    const vid = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!el) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        try {
          (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
        } catch {}
        return;
      }

      if (el.requestFullscreen) {
        await el.requestFullscreen();
        if (isLandscapeVideo) {
          try {
            await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape");
          } catch {}
        }
      } else if (vid?.webkitEnterFullscreen) {
        vid.webkitEnterFullscreen();
      }
    } catch {
      // Ignore fullscreen denial on restricted browsers
    }
    revealControls();
  }, [isLandscapeVideo, revealControls]);

  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) {
        try {
          (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
        } catch {}
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      try {
        (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
      } catch {}
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "Space" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        seekBy(-10);
      } else if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
        e.preventDefault();
        seekBy(10);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotateVideo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, seekBy, toggleMute, toggleFullscreen, rotateVideo]);

  const handleSideTap = (side: "left" | "right", e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (lastTapRef.current && lastTapRef.current.side === side && now - lastTapRef.current.time < 300) {
      lastTapRef.current = null;
      seekBy(side === "left" ? -10 : 10);
    } else {
      lastTapRef.current = { side, time: now };
      setControlsVisible((v) => !v);
      scheduleHideControls();
    }
  };

  if (isGone) {
    return (
      <div
        data-testid="video-deleted-placeholder"
        className="flex flex-col items-center justify-center bg-slate-900 text-slate-300 text-sm gap-2 p-10 rounded-2xl select-none"
      >
        <VideoOff size={28} className="opacity-75" />
        <span className="font-medium">วิดีโอนี้ถูกลบแล้ว</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center bg-gray-900 text-gray-300 text-sm gap-2 p-8 rounded-2xl">
        <AlertCircle size={18} /> โหลดวิดีโอไม่สำเร็จ
      </div>
    );
  }

  if (!srcUrl) {
    return (
      <div className="flex items-center justify-center bg-black/90 text-white rounded-2xl min-w-[260px] min-h-[200px] p-10">
        <Loader2 size={28} className="animate-spin opacity-80" />
      </div>
    );
  }

  const abStartPct = duration > 0 && abLoop.a !== null ? Math.min(100, (abLoop.a / duration) * 100) : 0;
  const abEndPct = duration > 0 && abLoop.b !== null ? Math.min(100, (abLoop.b / duration) * 100) : abStartPct;
  const isQuarterTurn = rotation === 90 || rotation === 270;

  let videoTransformStyle: React.CSSProperties | undefined;
  if (isQuarterTurn && containerSize.w > 0 && containerSize.h > 0 && videoNatW > 0 && videoNatH > 0) {
    const cw = containerSize.w;
    const ch = containerSize.h;
    const ar = videoNatW / videoNatH;
    let dispW: number;
    let dispH: number;
    if (cw / ch > ar) {
      dispH = ch;
      dispW = ch * ar;
    } else {
      dispW = cw;
      dispH = cw / ar;
    }
    const rotScale = Math.min(cw / dispH, ch / dispW);
    videoTransformStyle = {
      width: `${dispW}px`,
      height: `${dispH}px`,
      transform: `rotate(${rotation}deg) scale(${rotScale})`,
      transition: "transform 180ms ease-out",
    };
  } else if (rotation !== 0) {
    videoTransformStyle = {
      transform: `rotate(${rotation}deg)`,
      transition: "transform 180ms ease-out",
    };
  }

  return (
    <div
      ref={containerRef}
      data-testid="custom-video-player"
      data-rotation={rotation}
      onClick={(e) => e.stopPropagation()}
      onMouseMove={revealControls}
      className={`relative bg-black rounded-2xl overflow-hidden shadow-2xl select-none flex items-center justify-center group ${
        isFullscreen
          ? "w-screen h-screen rounded-none"
          : isQuarterTurn
            ? "w-full max-w-4xl h-[65dvh] sm:h-[72vh]"
            : "w-full max-w-4xl"
      } ${className}`}
    >
      <video
        ref={videoRef}
        src={srcUrl}
        controls={false}
        playsInline
        loop={isLooping}
        preload="metadata"
        onLoadedMetadata={async (e) => {
          const v = e.currentTarget;
          setDuration(Number.isFinite(v.duration) ? v.duration : 0);
          setIsLandscapeVideo(v.videoWidth > v.videoHeight);
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            setNaturalSize({ token, w: v.videoWidth, h: v.videoHeight });
          }

          if (v.videoWidth === 0 && v.videoHeight === 0) {
            if (!compatTried) {
              setCompatTriedToken(token);
              const canTranscode = await getVideoTranscodeAvailable();
              setServerHasFfmpeg(canTranscode);
              if (canTranscode && srcUrl && !srcUrl.includes("compat=1")) {
                setTranscodingToken(token);
                setAudioOnlyToken(null);
                setCompatUrlState({
                  token,
                  url: srcUrl + (srcUrl.includes("?") ? "&compat=1" : "?compat=1"),
                });
                return;
              }
            }
            setTranscodingToken(null);
            setAudioOnlyToken(token);
          } else {
            setTranscodingToken(null);
            setAudioOnlyToken(null);
          }

          if (autoPlay) {
            v.play().catch(() => {
              v.muted = true;
              setIsMuted(true);
              setAutoPlayMutedFallback(true);
              v.play().catch(() => {});
            });
          }
        }}
        onLoadedData={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth > 0) {
            setTranscodingToken(null);
            setAudioOnlyToken(null);
          }
        }}
        onPlay={() => {
          setIsPlaying(true);
          scheduleHideControls();
        }}
        onPause={() => {
          setIsPlaying(false);
          setControlsVisible(true);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          const t = v.currentTime;
          const { a, b } = abLoopRef.current;
          if (a !== null && b !== null && t >= b) {
            v.currentTime = a;
            setCurrentTime(a);
            return;
          }
          setCurrentTime(t);
        }}
        style={videoTransformStyle}
        className={`object-contain ${
          isQuarterTurn && videoTransformStyle
            ? "shrink-0"
            : isFullscreen
              ? "w-full h-full max-h-screen"
              : "w-full max-h-[70dvh] sm:max-h-[75vh]"
        }`}
      />

      {/* Top-Right Floating Rotate 90° Control (Auto-hides with Controls) */}
      <button
        type="button"
        data-testid="video-rotate-btn"
        onClick={(e) => {
          e.stopPropagation();
          rotateVideo();
        }}
        title="หมุนวิดีโอ 90° (ปุ่ม R)"
        className={`absolute top-3 right-3 z-30 px-2.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-sm border transition-all duration-200 cursor-pointer ${
          rotation !== 0
            ? "bg-blue-600/90 hover:bg-blue-600 text-white border-blue-400/50"
            : "bg-black/60 hover:bg-black/80 text-white border-white/15"
        } ${controlsVisible || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <RotateCw size={14} />
        <span>{rotation !== 0 ? `${rotation}°` : "หมุน"}</span>
      </button>

      {/* Interactive Tap Zones: Left (Double-tap -10s), Center (Tap Play/Pause), Right (Double-tap +10s) */}
      <div className="absolute inset-0 z-10 grid grid-cols-[28%_44%_28%]">
        <div
          data-testid="video-zone-left"
          onClick={(e) => handleSideTap("left", e)}
          className="h-full cursor-pointer"
          title="ดับเบิลแท็ปถอยหลัง 10 วินาที"
        />
        <div
          data-testid="video-zone-center"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className="h-full cursor-pointer flex items-center justify-center"
          title="แตะเพื่อเล่น / หยุดชั่วคราว"
        />
        <div
          data-testid="video-zone-right"
          onClick={(e) => handleSideTap("right", e)}
          className="h-full cursor-pointer"
          title="ดับเบิลแท็ปกรอไปข้างหน้า 10 วินาที"
        />
      </div>

      {/* Transient Gesture Feedback Badge */}
      {gestureHud && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 px-4 py-2 rounded-full bg-black/75 text-white text-sm font-bold shadow-lg backdrop-blur-sm">
          {gestureHud.text}
        </div>
      )}

      {/* Compatibility Transcoding HUD or Audio-Only Codec Warning */}
      {isTranscodingCompat && (
        <div
          data-testid="video-compat-loading"
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 text-white gap-2 p-6 text-center"
        >
          <Loader2 size={28} className="animate-spin text-blue-400" />
          <div className="text-sm font-bold">กำลังเตรียมภาพวิดีโอให้เหมาะกับเบราว์เซอร์ (H.265 → H.264)...</div>
          <div className="text-xs text-gray-300">ไฟล์ต้นฉบับไม่ถูกแก้ไข แปลงเฉพาะแคชพรีวิวบนเว็บ</div>
        </div>
      )}

      {audioOnlyCodecNotice && !isTranscodingCompat && (
        <div
          data-testid="video-audio-only-notice"
          className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 z-20 mx-auto max-w-md rounded-2xl bg-slate-900/90 border border-amber-500/40 px-4 py-3 text-center text-white shadow-xl"
        >
          <div className="text-xs sm:text-sm font-bold text-amber-300">
            {serverHasFfmpeg
              ? "กำลังเล่นเฉพาะเสียง (ไฟล์ใช้ Codec เฉพาะทาง เช่น ByteVC2 / bvc2)"
              : "กำลังเล่นเฉพาะเสียง (ไม่พบภาพสำหรับ Codec H.265 / HEVC)"}
          </div>
          <div className="text-[11px] sm:text-xs text-gray-300 mt-1">
            {serverHasFfmpeg
              ? "ไฟล์วิดีโอนี้เข้ารหัสด้วย Codec เฉพาะทางนอกมาตรฐานสากล (เช่น ByteVC2 ของ TikTok) ที่เบราว์เซอร์และ FFmpeg มาตรฐานไม่รองรับการถอดรหัสภาพ — สามารถฟังเสียงหรือกดดาวน์โหลดได้ตามปกติ"
              : "เบราว์เซอร์นี้ไม่รองรับภาพ H.265 และเซิร์ฟเวอร์ยังไม่ได้ติดตั้ง FFmpeg — สามารถฟังเสียงได้ตามปกติ หรือกดดาวน์โหลดเพื่อเปิดดูใน VLC / มือถือ"}
          </div>
        </div>
      )}

      {/* Autoplay Muted Unmute Pill */}
      {autoPlayMutedFallback && isMuted && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="absolute top-3 left-3 z-30 px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
        >
          <VolumeX size={14} /> แตะเพื่อเปิดเสียง
        </button>
      )}

      {/* Bottom Controls Bar (Touch-Friendly for Mobile + Full Desktop Controls) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/65 to-transparent pt-8 pb-2.5 px-3 sm:px-4 transition-opacity duration-200 ${
          controlsVisible || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Seek Bar + A-B Segment Indicator */}
        <div className="relative w-full flex items-center mb-2">
          {abLoop.a !== null && abLoop.b !== null && duration > 0 && (
            <div
              className="absolute h-1.5 bg-emerald-400/80 rounded-full pointer-events-none z-0"
              style={{ left: `${abStartPct}%`, width: `${Math.max(1, abEndPct - abStartPct)}%` }}
            />
          )}
          <input
            type="range"
            data-testid="video-seek-bar"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(currentTime, duration || 1)}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = val;
              setCurrentTime(val);
              revealControls();
            }}
            className="w-full h-2 accent-blue-500 cursor-pointer relative z-10"
            aria-label="เลื่อนเวลาวิดีโอ"
          />
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-white">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              data-testid="video-seek-back-btn"
              onClick={() => seekBy(-10)}
              className="p-2 rounded-lg hover:bg-white/15 active:bg-white/25 cursor-pointer flex items-center gap-0.5 text-xs font-bold"
              title="ถอยหลัง 10 วินาที"
            >
              <RotateCcw size={16} />
              <span className="hidden xs:inline sm:inline">10s</span>
            </button>

            <button
              type="button"
              data-testid="video-play-toggle-btn"
              onClick={togglePlay}
              className="p-2 sm:px-3 rounded-xl bg-white/15 hover:bg-white/25 active:bg-white/30 cursor-pointer"
              title={isPlaying ? "หยุดชั่วคราว" : "เล่น"}
            >
              {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
            </button>

            <button
              type="button"
              data-testid="video-seek-fwd-btn"
              onClick={() => seekBy(10)}
              className="p-2 rounded-lg hover:bg-white/15 active:bg-white/25 cursor-pointer flex items-center gap-0.5 text-xs font-bold"
              title="กรอไปข้างหน้า 10 วินาที"
            >
              <span className="hidden xs:inline sm:inline">10s</span>
              <RotateCw size={16} />
            </button>

            <span className="text-[11px] sm:text-xs font-mono text-gray-200 ml-1" data-testid="video-time-label">
              {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Volume Mute + Desktop/Android Slider */}
            <button
              type="button"
              data-testid="video-mute-btn"
              onClick={toggleMute}
              className="p-2 rounded-lg hover:bg-white/15 cursor-pointer"
              title={isMuted ? "เปิดเสียง" : "ปิดเสียง"}
            >
              {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <input
              type="range"
              data-testid="video-volume-slider"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="hidden sm:block w-16 md:w-20 h-1.5 accent-blue-400 cursor-pointer"
              title="ปรับระดับเสียง"
            />

            {/* Speed Toggle */}
            <button
              type="button"
              data-testid="video-speed-btn"
              onClick={cycleSpeed}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold cursor-pointer"
              title="ปรับความเร็วในการเล่น"
            >
              {playbackRate}x
            </button>

            {/* Full Video Loop Toggle */}
            <button
              type="button"
              data-testid="video-loop-btn"
              onClick={() => {
                setIsLooping((prev) => {
                  const next = !prev;
                  flashHud(next ? "เปิดวนลูปทั้งคลิป" : "ปิดวนลูป");
                  return next;
                });
                revealControls();
              }}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isLooping ? "bg-blue-600 text-white" : "hover:bg-white/15 text-gray-200"
              }`}
              title="วนลูปทั้งคลิป"
            >
              <Repeat size={15} />
            </button>

            {/* A-B Segment Loop */}
            <button
              type="button"
              data-testid="video-ab-loop-btn"
              onClick={cycleAbLoop}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                abLoop.b !== null
                  ? "bg-emerald-600 text-white"
                  : abLoop.a !== null
                    ? "bg-amber-500 text-white"
                    : "bg-white/10 hover:bg-white/20 text-gray-200"
              }`}
              title="กำหนดจุดเริ่มต้น A - จุดสิ้นสุด B เพื่อวนลูปเฉพาะช่วง"
            >
              {abLoop.b !== null ? "A-B ✓" : abLoop.a !== null ? "ตั้ง B" : "A-B"}
            </button>

            {/* Fullscreen + Smart Landscape Auto-Rotate */}
            <button
              type="button"
              data-testid="video-fullscreen-btn"
              onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-white/15 cursor-pointer"
              title={isFullscreen ? "ย่อหน้าจอ" : isLandscapeVideo ? "ขยายเต็มจอ (หมุนแนวนอนอัตโนมัติ)" : "ขยายเต็มจอ"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
