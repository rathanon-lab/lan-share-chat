"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function TruncatedFileName({ fileName, className = "" }: { fileName: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!fileName) return null;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((prev) => !prev);
      }}
      className={`group cursor-pointer select-none mt-1 transition-all ${className}`}
      title={expanded ? "คลิกเพื่อย่อชื่อไฟล์" : "คลิกเพื่อดูชื่อไฟล์เต็ม"}
    >
      <div className="flex items-center justify-between gap-1.5 text-[11px] opacity-85 hover:opacity-100 transition-opacity">
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: expanded ? "normal" : "nowrap",
            wordBreak: "break-all",
          }}
          className="flex-1 font-medium leading-tight"
        >
          {fileName}
        </span>
        <span className="text-[10px] opacity-60 group-hover:opacity-100 shrink-0 flex items-center gap-0.5 bg-black/10 px-1 py-0.5 rounded">
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </span>
      </div>
    </div>
  );
}
