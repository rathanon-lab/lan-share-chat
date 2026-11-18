'use client';

import React, { useRef, useState } from 'react';
import { Camera, Check, Shuffle, X } from 'lucide-react';
import { ANIMAL_AVATAR_PRESETS, AnimalAvatarPreset } from '@/lib/avatars';
import { UserAvatar } from './UserAvatar';
import { AvatarCropModal } from './AvatarCropModal';

interface ProfileModalProps {
  deviceId: string;
  currentName: string;
  currentAvatarUrl: string;
  presets?: AnimalAvatarPreset[];
  onClose: () => void;
  onSaveProfile: (params: { name: string; avatarUrl?: string; croppedDataUrl?: string }) => Promise<void>;
}

export function ProfileModal({
  currentName,
  currentAvatarUrl,
  presets = ANIMAL_AVATAR_PRESETS,
  onClose,
  onSaveProfile,
}: ProfileModalProps) {
  const [name, setName] = useState(currentName);
  const [selectedPresetUrl, setSelectedPresetUrl] = useState(currentAvatarUrl);
  const [croppedDataUrl, setCroppedDataUrl] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = croppedDataUrl || selectedPresetUrl;

  const handleRandomPick = () => {
    const candidates = presets.filter((p) => p.url !== selectedPresetUrl);
    const pick = candidates[Math.floor(Math.random() * candidates.length)] || presets[0];
    setSelectedPresetUrl(pick.url);
    setCroppedDataUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('กรุณาตั้งชื่ออุปกรณ์อย่างน้อย 1 ตัวอักษร');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSaveProfile({
        name: clean.slice(0, 24),
        avatarUrl: croppedDataUrl ? undefined : selectedPresetUrl,
        croppedDataUrl: croppedDataUrl || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถบันทึกโปรไฟล์ได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        data-testid="profile-modal"
        className="fixed inset-0 bg-black/55 backdrop-blur-xs z-[90] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden border border-gray-200"
        >
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-bold text-base text-gray-900">ตั้งค่าโปรไฟล์ประจำเครื่อง</h3>
              <p className="text-[11px] text-gray-500">เปลี่ยนชื่อและเลือกอวตารสัตว์หรืออัปโหลดรูปเอง (ไม่ต้องสมัครบัญชี)</p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4">
            {/* Active Avatar Preview + Actions */}
            <div className="flex items-center gap-4 bg-blue-50/60 border border-blue-100 rounded-2xl p-3.5">
              <UserAvatar src={previewUrl} name={name} size={64} />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="text-sm font-bold text-gray-900 truncate">{name || 'ไม่มีชื่อ'}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRandomPick}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50"
                  >
                    <Shuffle size={12} /> สุ่มอวตาร
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Camera size={12} /> อัปโหลดรูป
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setCropFile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Name Field */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                ชื่อแสดงในห้องแชท (สูงสุด 24 ตัวอักษร)
              </label>
              <input
                type="text"
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="profile-name-input"
                placeholder="ตั้งชื่อเครื่องของคุณ..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm font-medium text-gray-900"
              />
            </div>

            {/* 20 Animal Avatar Presets */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-700">คลังอวตารสัตว์ ({presets.length} แบบ)</span>
                {croppedDataUrl && (
                  <span className="text-[11px] font-semibold text-emerald-600">กำลังใช้รูปที่อัปโหลดเอง</span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {presets.map((preset) => {
                  const active = !croppedDataUrl && selectedPresetUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedPresetUrl(preset.url);
                        setCroppedDataUrl(null);
                      }}
                      title={preset.name}
                      className={`group flex flex-col items-center p-1.5 rounded-xl border transition-all ${
                        active
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.name}
                        className="w-11 h-11 rounded-full object-cover"
                      />
                      <span className="text-[10px] text-gray-600 truncate w-full text-center mt-1 font-medium">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              data-testid="profile-save-btn"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Check size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
            </button>
          </div>
        </form>
      </div>

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(dataUrl) => {
            setCroppedDataUrl(dataUrl);
            setCropFile(null);
          }}
        />
      )}
    </>
  );
}
