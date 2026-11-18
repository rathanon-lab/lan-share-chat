"use client";

export function pickSupportedRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  // Prefer Safari-compatible audio/mp4 first if supported cleanly, then standard opus/webm
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {}
  }
  return '';
}

function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function mixDownToMono(audioBuffer: AudioBuffer): Float32Array {
  const ch0 = audioBuffer.getChannelData(0);
  if (audioBuffer.numberOfChannels === 1) return ch0;
  const ch1 = audioBuffer.getChannelData(1);
  const mixed = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) {
    mixed[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return mixed;
}

/**
 * Encodes a recorded browser Blob (audio/mp4 from Safari or audio/webm from Chrome/Firefox)
 * into a universal audio/mpeg (.mp3) File entirely in JavaScript using Web Audio + lamejs.
 * Falls back cleanly to raw blob if AudioContext decoding is unavailable.
 */
export async function transcodeAudioBlobToMp3(rawBlob: Blob): Promise<File> {
  const timestamp = Date.now();
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('AudioContext unavailable');

    const ctx = new AudioCtx();
    try {
      const arrayBuf = await rawBlob.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
      const monoFloat = mixDownToMono(audioBuffer);
      const pcm16 = floatToInt16(monoFloat);

      const { Mp3Encoder } = await import('@breezystack/lamejs');
      const encoder = new Mp3Encoder(1, audioBuffer.sampleRate, 128);
      const blockSize = 1152;
      const chunks: BlobPart[] = [];

      for (let i = 0; i < pcm16.length; i += blockSize) {
        const slice = pcm16.subarray(i, i + blockSize);
        const mp3buf = encoder.encodeBuffer(slice);
        if (mp3buf.length > 0) {
          chunks.push(new Uint8Array(mp3buf));
        }
      }
      const endBuf = encoder.flush();
      if (endBuf.length > 0) {
        chunks.push(new Uint8Array(endBuf));
      }

      const mp3Blob = new Blob(chunks, { type: 'audio/mpeg' });
      if (mp3Blob.size > 0) {
        return new File([mp3Blob], `voice_${timestamp}.mp3`, { type: 'audio/mpeg' });
      }
    } finally {
      await ctx.close().catch(() => {});
    }
  } catch (err) {
    console.warn('[VoiceRecorder] Falling back to native container audio:', err);
  }

  const ext = rawBlob.type.includes('mp4')
    ? 'm4a'
    : rawBlob.type.includes('ogg')
      ? 'ogg'
      : rawBlob.type.includes('wav')
        ? 'wav'
        : 'webm';
  return new File([rawBlob], `voice_${timestamp}.${ext}`, {
    type: rawBlob.type || 'audio/mp4',
  });
}
