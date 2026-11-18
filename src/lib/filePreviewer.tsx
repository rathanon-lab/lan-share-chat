"use client";

import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {
  Loader2, AlertTriangle, ShieldAlert, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Download, FileArchive, FileText, Code2, X, FileCheck2, RotateCcw
} from 'lucide-react';
import {
  fetchEncryptedMediaBlob,
  downloadEncryptedMedia,
  SecureImage,
  SecureAudio,
} from './secureMedia';
import { CustomVideoPlayer } from '@/features/chat/components/CustomVideoPlayer';

export type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'markdown'
  | 'docx'
  | 'zip'
  | 'blocked_code'
  | 'text'
  | 'unsupported';

export interface PreviewableFile {
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  mediaToken: string;
}

export function getExtension(fileName?: string): string {
  if (!fileName) return '';
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : '';
}

export function getFilePreviewKind(fileName?: string, mimeType?: string): PreviewKind {
  const ext = getExtension(fileName);
  const mime = String(mimeType || '').toLowerCase();

  // Strictly block executable markup formats from live rendering
  if (['.html', '.htm', '.xhtml', '.svg'].includes(ext) || mime.includes('text/html') || mime.includes('svg')) {
    return 'blocked_code';
  }
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.heic', '.heif'].includes(ext) || mime.startsWith('image/')) {
    return 'image';
  }
  if (['.mp4', '.m4v', '.mov', '.webm', '.ogv'].includes(ext) || mime.startsWith('video/')) {
    return 'video';
  }
  if (['.mp3', '.m4a', '.mp4a', '.aac', '.wav', '.ogg', '.flac'].includes(ext) || mime.startsWith('audio/')) {
    return 'audio';
  }
  if (ext === '.pdf' || mime === 'application/pdf') {
    return 'pdf';
  }
  if (ext === '.md' || ext === '.markdown' || mime === 'text/markdown') {
    return 'markdown';
  }
  if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (ext === '.zip' || mime === 'application/zip' || mime === 'application/x-zip-compressed') {
    return 'zip';
  }
  if (['.js', '.ts', '.tsx', '.jsx', '.css', '.json', '.xml', '.yml', '.yaml', '.py', '.sh'].includes(ext)) {
    return 'blocked_code';
  }
  if (['.txt', '.csv', '.log', '.ini', '.env'].includes(ext) || mime.startsWith('text/')) {
    return 'text';
  }
  return 'unsupported';
}

export function isRichPreviewSupported(fileName?: string, mimeType?: string): boolean {
  const kind = getFilePreviewKind(fileName, mimeType);
  return kind !== 'unsupported' && kind !== 'zip';
}

function PdfCanvasViewer({ token, fileName }: { token: string; fileName: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { blob } = await fetchEncryptedMediaBlob(token, { fileName });
        const arrayBuf = await blob.arrayBuffer();
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuf) });
        const doc = await loadingTask.promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setPageNum(1);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'ไม่สามารถอ่านไฟล์ PDF ได้');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, fileName]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: any = null;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
      } catch {}
    })();
    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {}
    };
  }, [pdfDoc, pageNum, scale]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2">
        <Loader2 size={28} className="animate-spin text-blue-600" />
        <span className="text-sm">กำลังถอดรหัสและเตรียมหน้า PDF...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-center text-red-500 text-sm">{error}</div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 mb-3 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={pageNum <= 1}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 flex items-center"
          >
            <ChevronLeft size={14} /> ก่อนหน้า
          </button>
          <span className="px-2 font-semibold text-gray-700" data-testid="pdf-page-indicator">
            หน้า {pageNum} / {numPages}
          </span>
          <button
            type="button"
            disabled={pageNum >= numPages}
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 flex items-center"
          >
            ถัดไป <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(2)))}
            className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50"
            title="ย่อ"
          >
            <ZoomOut size={14} />
          </button>
          <span className="px-1.5 font-mono text-gray-600">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.5, +(s + 0.2).toFixed(2)))}
            className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50"
            title="ขยาย"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div className="w-full overflow-auto max-h-[65vh] flex justify-center bg-gray-800/90 rounded-xl p-3">
        <canvas ref={canvasRef} data-testid="pdf-canvas" className="shadow-lg rounded bg-white max-w-full h-auto" />
      </div>
    </div>
  );
}

function DocumentTextViewer({
  token,
  fileName,
  kind,
}: {
  token: string;
  fileName: string;
  kind: 'markdown' | 'docx' | 'blocked_code' | 'text';
}) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { blob } = await fetchEncryptedMediaBlob(token, { fileName });
        if (kind === 'docx') {
          const buf = await blob.arrayBuffer();
          const mammoth = (await import('mammoth')).default;
          const DOMPurify = (await import('dompurify')).default;
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          const cleanHtml = DOMPurify.sanitize(result.value);
          if (!cancelled) {
            setContent(cleanHtml);
            setLoading(false);
          }
        } else {
          const text = await blob.slice(0, 500 * 1024).text();
          if (!cancelled) {
            setContent(text);
            setLoading(false);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'ไม่สามารถอ่านเนื้อหาไฟล์ได้');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, fileName, kind]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
        <Loader2 size={22} className="animate-spin text-blue-600" />
        <span className="text-sm">กำลังโหลดเอกสาร...</span>
      </div>
    );
  }
  if (error) return <div className="p-6 text-center text-red-500 text-sm">{error}</div>;

  const ext = getExtension(fileName);
  const isBlockedActiveMarkup = ['.html', '.htm', '.xhtml', '.svg', '.js'].includes(ext);
  const zoomToolbar = (
    <div className="flex items-center justify-between gap-2 w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 mb-3 text-xs">
      <span className="font-semibold text-gray-600">
        {kind === 'markdown' ? 'Markdown Document' : kind === 'docx' ? 'Word Document' : 'Document Viewer'}
      </span>
      <div className="flex items-center gap-1" data-testid="doc-zoom-controls">
        <button
          type="button"
          data-testid="doc-zoom-out"
          onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
          className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer"
          title="ย่อ (Zoom Out)"
        >
          <ZoomOut size={14} />
        </button>
        <span className="px-2 font-mono text-gray-700 min-w-[48px] text-center" data-testid="doc-zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          data-testid="doc-zoom-in"
          onClick={() => setZoom((z) => Math.min(2.0, +(z + 0.15).toFixed(2)))}
          className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer"
          title="ขยาย (Zoom In)"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          data-testid="doc-zoom-reset"
          onClick={() => setZoom(1)}
          className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer ml-1"
          title="ขนาดปกติ (100%)"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  );

  if (kind === 'markdown') {
    return (
      <div className="flex flex-col items-center w-full">
        {zoomToolbar}
        <div className="w-full max-h-[60vh] overflow-auto bg-slate-100 border border-gray-200 rounded-xl p-3 sm:p-6">
          <div
            data-testid="markdown-preview"
            style={{ zoom }}
            className="mx-auto w-full max-w-2xl bg-white border border-gray-200/90 shadow-sm rounded-xl p-5 sm:p-7 prose prose-sm text-gray-800"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'docx') {
    return (
      <div className="flex flex-col items-center w-full">
        {zoomToolbar}
        <div className="w-full max-h-[60vh] overflow-auto bg-slate-100 border border-gray-200 rounded-xl p-3 sm:p-6">
          <div
            data-testid="docx-preview"
            style={{ zoom }}
            className="mx-auto w-full max-w-2xl bg-white border border-gray-200/90 shadow-sm rounded-xl p-5 sm:p-7 text-sm leading-relaxed text-gray-800"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full" data-testid={isBlockedActiveMarkup ? 'blocked-html-preview' : 'text-code-preview'}>
      {zoomToolbar}
      {isBlockedActiveMarkup && (
        <div className="w-full flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-xl px-3.5 py-2.5 mb-3 text-xs">
          <ShieldAlert size={16} className="shrink-0 mt-0.5 text-red-600" />
          <div>
            <div className="font-bold">บล็อกการรันสคริปต์ / Live HTML เพื่อความปลอดภัย (XSS Protection)</div>
            <div className="text-red-700 mt-0.5">
              แสดงเป็นซอร์สโค้ดแบบอ่านอย่างเดียวเพื่อป้องกันการรัน JavaScript ภายใต้ Session ของห้องแชท
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-h-[58vh] overflow-auto bg-slate-900 rounded-xl p-3 sm:p-5">
        <pre
          style={{ fontSize: `${Math.round(12 * zoom)}px` }}
          className="mx-auto w-full max-w-3xl text-slate-100 font-mono leading-relaxed whitespace-pre-wrap break-words"
        >
          {content}
        </pre>
      </div>
    </div>
  );
}

export function UniversalFilePreviewModal({
  file,
  onClose,
}: {
  file: PreviewableFile;
  onClose: () => void;
}) {
  const kind = getFilePreviewKind(file.fileName, file.mimeType);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
      data-testid="file-preview-modal"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 bg-gray-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              {kind === 'zip' ? (
                <FileArchive size={17} />
              ) : kind === 'blocked_code' ? (
                <Code2 size={17} />
              ) : kind === 'pdf' || kind === 'markdown' || kind === 'docx' ? (
                <FileText size={17} />
              ) : (
                <FileCheck2 size={17} />
              )}
            </span>
            <div className="min-w-0">
              <div className="font-bold text-sm text-gray-900 truncate" title={file.fileName}>
                {file.fileName}
              </div>
              <div className="text-[11px] text-gray-500 flex items-center gap-2">
                <span className="uppercase font-semibold">{kind.replace('_', ' ')}</span>
                {typeof file.fileSize === 'number' && file.fileSize > 0 && (
                  <span>• {(file.fileSize / 1024).toFixed(1)} KB</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => downloadEncryptedMedia(file.mediaToken, file.fileName)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Download size={14} /> ดาวน์โหลด
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500"
              aria-label="ปิดหน้าต่างพรีวิว"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-start bg-gray-50/40">
          {kind === 'image' && (
            <SecureImage
              token={file.mediaToken}
              alt={file.fileName}
              fileName={file.fileName}
              className="max-h-[72vh] max-w-full rounded-xl object-contain shadow my-auto"
            />
          )}
          {kind === 'video' && (
            <CustomVideoPlayer token={file.mediaToken} autoPlay className="my-auto" />
          )}
          {kind === 'audio' && (
            <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-sm my-auto">
              <div className="text-sm font-semibold text-gray-800 mb-3">{file.fileName}</div>
              <SecureAudio token={file.mediaToken} className="w-full" />
            </div>
          )}
          {kind === 'pdf' && <PdfCanvasViewer token={file.mediaToken} fileName={file.fileName} />}
          {(kind === 'markdown' || kind === 'docx' || kind === 'blocked_code' || kind === 'text') && (
            <DocumentTextViewer token={file.mediaToken} fileName={file.fileName} kind={kind} />
          )}
          {(kind === 'unsupported' || kind === 'zip') && (
            <div className="py-10 text-center text-gray-500 my-auto">
              <AlertTriangle size={28} className="mx-auto mb-2 text-amber-500" />
              <div className="text-sm font-semibold text-gray-700 mb-1">
                {kind === 'zip'
                  ? 'ไฟล์บีบอัด (ZIP) ใช้สำหรับการดาวน์โหลดโดยตรงเท่านั้น'
                  : 'ไฟล์ชนิดนี้ไม่รองรับการเปิดพรีวิวในเบราว์เซอร์'}
              </div>
              <div className="text-xs text-gray-500">กรุณากดปุ่ม &ldquo;ดาวน์โหลด&rdquo; ด้านบนเพื่อเปิดด้วยโปรแกรมที่เกี่ยวข้อง</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
