import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-dvh w-full bg-gray-100 flex flex-col items-center justify-center gap-3 text-slate-600">
      <Loader2 size={28} className="animate-spin text-blue-600" />
      <p className="text-sm font-medium">กำลังโหลดห้องแชท LAN Share Chat...</p>
    </div>
  );
}
