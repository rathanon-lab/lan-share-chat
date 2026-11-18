"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { PeerInfo, RuntimeConfig, TransferItem } from "@/types/chat";

export interface IncomingP2PRequest {
  senderIp: string;
  senderDeviceId?: string;
  senderName: string;
  files: { name: string; size: number }[];
  totalSize: number;
}

interface UseWebRTCTransferParams {
  socket: Socket | null;
  peersRef: React.MutableRefObject<PeerInfo[]>;
  runtimeConfig: RuntimeConfig;
  showToast: (text: string, type?: 'info' | 'error' | 'success') => void;
}

export function useWebRTCTransfer({
  socket,
  peersRef,
  runtimeConfig,
  showToast,
}: UseWebRTCTransferParams) {
  const [isDirectSendModalOpen, setIsDirectSendModalOpen] = useState(false);
  const [targetPeer, setTargetPeer] = useState<PeerInfo | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [duplicateFileNames, setDuplicateFileNames] = useState<string[]>([]);
  const [duplicateCountdown, setDuplicateCountdown] = useState(0);
  const [fileError, setFileError] = useState("");
  const [errorCountdown, setErrorCountdown] = useState(0);

  const [isWaitingForReply, setIsWaitingForReply] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState<IncomingP2PRequest | null>(null);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isTransferCancelled, setIsTransferCancelled] = useState(false);
  const [transferTransport, setTransferTransport] = useState<'webrtc' | 'relay'>('webrtc');
  const [completedDownloads, setCompletedDownloads] = useState<{ name: string; size: number; url: string }[]>([]);

  const selectedFilesRef = useRef<File[]>([]);
  const targetPeerRef = useRef<PeerInfo | null>(null);
  const cancelTransferFlagRef = useRef(false);
  const rtcConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
  const dataChannels = useRef<{ [key: string]: RTCDataChannel }>({});
  const iceCandidateQueues = useRef<{ [key: string]: RTCIceCandidateInit[] }>({});
  const downloadQueueDelayRef = useRef(0);
  const receiveBuffers = useRef<{ [transferId: string]: Blob[] }>({});
  const receiveMetadata = useRef<{ [transferId: string]: any }>({});
  const activeRelayTransferRef = useRef<{ id: string; expectedBytes: number; receivedBytes: number } | null>(null);

  useEffect(() => {
    if (duplicateCountdown <= 0) return;
    const timer = setInterval(() => {
      setDuplicateCountdown((prev) => {
        if (prev <= 1) {
          setDuplicateFileNames([]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [duplicateCountdown]);

  useEffect(() => {
    if (errorCountdown <= 0) return;
    const timer = setInterval(() => {
      setErrorCountdown((prev) => {
        if (prev <= 1) {
          setFileError("");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [errorCountdown]);

  const closeAllConnections = () => {
    Object.values(rtcConnections.current).forEach((pc) => {
      try { pc.close(); } catch {}
    });
    rtcConnections.current = {};
    dataChannels.current = {};
  };

  const beginReceiveFile = (id: string, fileName: string, fileSize: number, fileType: string, peerName: string) => {
    receiveBuffers.current[id] = [];
    receiveMetadata.current[id] = { fileName, fileType, fileSize, peerName, finalized: false };
    setTransfers((prev) => [
      ...prev,
      { id, peerName, fileName, fileSize, progress: 0, status: 'transferring', direction: 'download' },
    ]);
  };

  const appendReceiveChunk = (
    id: string,
    chunkData: ArrayBuffer | Uint8Array,
    tracker: { expectedBytes: number; receivedBytes: number }
  ) => {
    if (!receiveBuffers.current[id]) return;
    const blobPart = chunkData instanceof ArrayBuffer ? chunkData : new Uint8Array(chunkData);
    receiveBuffers.current[id].push(new Blob([blobPart]));
    tracker.receivedBytes += chunkData.byteLength;
    const progress = tracker.expectedBytes > 0 ? Math.min(99, Math.round((tracker.receivedBytes / tracker.expectedBytes) * 100)) : 100;
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, progress } : t)));
  };

  const finalizeReceiveFile = (id: string) => {
    const meta = receiveMetadata.current[id];
    const parts = receiveBuffers.current[id];
    if (!meta || meta.finalized || !parts) return;
    meta.finalized = true;

    let finalName = meta.fileName || 'download';
    if (!finalName.includes('.')) {
      const extMap: Record<string, string> = {
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'image/jpeg': '.jpg',
        'image/png': '.png',
      };
      const ext = extMap[meta.fileType];
      if (ext) finalName += ext;
    }

    const fileBlob = new Blob(parts, { type: meta.fileType || 'application/octet-stream' });
    const url = URL.createObjectURL(fileBlob);

    setCompletedDownloads((prev) => [...prev, { name: finalName, size: meta.fileSize || fileBlob.size, url }]);

    const now = Date.now();
    const scheduledTime = Math.max(now, downloadQueueDelayRef.current + 350);
    downloadQueueDelayRef.current = scheduledTime;
    const waitMs = Math.max(0, scheduledTime - now);

    setTimeout(() => {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = finalName;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {}
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, waitMs);

    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'completed', progress: 100 } : t)));
    delete receiveBuffers.current[id];
    delete receiveMetadata.current[id];
  };

  const initPeerConnection = (peerKey: string, targetIp: string, sock: Socket, peerName: string) => {
    const pc = new RTCPeerConnection({ iceServers: [] });

    pc.onicecandidate = (e) => {
      if (e.candidate && sock) {
        sock.emit('webrtc_signaling', {
          targetDeviceId: peerKey,
          targetIp,
          type: 'candidate',
          payload: e.candidate,
        });
      }
    };

    pc.ondatachannel = (e) => {
      setTransferTransport('webrtc');
      setupDataChannel(e.channel, peerKey, peerName);
    };

    rtcConnections.current[peerKey] = pc;
    return pc;
  };

  const setupDataChannel = (channel: RTCDataChannel, peerKey: string, peerName: string) => {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 64 * 1024;

    let activeState: { id: string; expectedBytes: number; receivedBytes: number } | null = null;

    channel.onmessage = async (e) => {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data);
        if (msg.type === 'file_header') {
          activeState = {
            id: msg.id,
            expectedBytes: Number(msg.fileSize) || 0,
            receivedBytes: 0,
          };
          beginReceiveFile(msg.id, msg.fileName, activeState.expectedBytes, msg.fileType, peerName);
        } else if (msg.type === 'file_end') {
          finalizeReceiveFile(msg.id);
          activeState = null;
        }
      } else if (activeState) {
        const buf = e.data instanceof ArrayBuffer
          ? e.data
          : e.data instanceof Blob
            ? await e.data.arrayBuffer()
            : null;
        if (buf) {
          appendReceiveChunk(activeState.id, buf, activeState);
          if (activeState.expectedBytes > 0 && activeState.receivedBytes >= activeState.expectedBytes) {
            finalizeReceiveFile(activeState.id);
            activeState = null;
          }
        }
      }
    };

    dataChannels.current[peerKey] = channel;
  };

  const waitForDataChannelOpen = (channel: RTCDataChannel, pc: RTCPeerConnection, timeoutMs = 3500): Promise<boolean> => {
    return new Promise((resolve) => {
      if (channel.readyState === 'open') return resolve(true);
      let settled = false;
      const done = (ok: boolean) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(ok);
        }
      };
      const timer = setTimeout(() => done(false), timeoutMs);
      channel.onopen = () => done(true);
      channel.onerror = () => done(false);
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') done(false);
      };
    });
  };

  const waitForBufferedDrain = (channel: RTCDataChannel, highWater: number): Promise<void> => {
    if (channel.bufferedAmount <= highWater) return Promise.resolve();
    return new Promise((resolve) => {
      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          channel.onbufferedamountlow = null;
          clearInterval(poll);
          resolve();
        }
      };
      channel.onbufferedamountlow = finish;
      const poll = setInterval(() => {
        if (channel.readyState !== 'open' || channel.bufferedAmount <= highWater) finish();
      }, 25);
    });
  };

  const sendViaRelay = async (peerKey: string, targetIp: string, peerName: string, sock: Socket) => {
    setTransferTransport('relay');
    const chunkSize = 32 * 1024;
    const files = [...selectedFilesRef.current];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (cancelTransferFlagRef.current) return;
      const file = files[fileIndex];
      const transferId = `relay_${Date.now()}_${fileIndex}`;

      setTransfers((prev) => [
        ...prev,
        { id: transferId, peerName, peerKey, fileName: file.name, fileSize: file.size, progress: 0, status: 'transferring', direction: 'upload' },
      ]);

      await new Promise<void>((resolve) => {
        sock.timeout(10000).emit(
          'direct_relay',
          {
            targetDeviceId: peerKey,
            targetIp,
            relayType: 'file_header',
            id: transferId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          },
          () => resolve()
        );
      });

      let offset = 0;
      while (offset < file.size) {
        if (cancelTransferFlagRef.current) return;
        const slice = file.slice(offset, offset + chunkSize);
        const buf = await slice.arrayBuffer();
        await new Promise<void>((resolve) => {
          sock.timeout(15000).emit(
            'direct_relay',
            { targetDeviceId: peerKey, targetIp, relayType: 'file_chunk', id: transferId, chunk: buf },
            () => resolve()
          );
        });
        offset += slice.size;
        const progress = file.size > 0 ? Math.min(99, Math.round((offset / file.size) * 100)) : 100;
        setTransfers((prev) => prev.map((t) => (t.id === transferId ? { ...t, progress } : t)));
      }

      await new Promise<void>((resolve) => {
        sock.timeout(10000).emit('direct_relay', { targetDeviceId: peerKey, targetIp, relayType: 'file_end', id: transferId }, () => resolve());
      });

      setTransfers((prev) => prev.map((t) => (t.id === transferId ? { ...t, status: 'completed', progress: 100 } : t)));
    }
    selectedFilesRef.current = [];
  };

  const startActualDirectTransfer = async (peerKey: string, targetIp: string, peerName: string, sock: Socket) => {
    if (!sock || selectedFilesRef.current.length === 0) return;

    setIsTransferring(true);
    setTransferTransport('webrtc');

    if (dataChannels.current[peerKey]) {
      try { dataChannels.current[peerKey].close(); } catch {}
      delete dataChannels.current[peerKey];
    }
    if (rtcConnections.current[peerKey]) {
      try { rtcConnections.current[peerKey].close(); } catch {}
      delete rtcConnections.current[peerKey];
    }

    if (typeof RTCPeerConnection === 'undefined') {
      await sendViaRelay(peerKey, targetIp, peerName, sock);
      return;
    }

    const pc = initPeerConnection(peerKey, targetIp, sock, peerName);
    const channel = pc.createDataChannel('fileTransfer');
    setupDataChannel(channel, peerKey, peerName);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sock.emit('webrtc_signaling', { targetDeviceId: peerKey, targetIp, type: 'offer', payload: offer });
    } catch {
      await sendViaRelay(peerKey, targetIp, peerName, sock);
      return;
    }

    const opened = await waitForDataChannelOpen(channel, pc, 3500);
    if (!opened || channel.readyState !== 'open') {
      try { channel.close(); } catch {}
      try { pc.close(); } catch {}
      delete dataChannels.current[peerKey];
      delete rtcConnections.current[peerKey];
      await sendViaRelay(peerKey, targetIp, peerName, sock);
      return;
    }

    const chunkSize = 16 * 1024;
    const highWaterMark = 256 * 1024;
    const files = [...selectedFilesRef.current];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (cancelTransferFlagRef.current) return;
      const file = files[fileIndex];
      const transferId = `tx_${Date.now()}_${fileIndex}`;

      setTransfers((prev) => [
        ...prev,
        { id: transferId, peerName, peerKey, fileName: file.name, fileSize: file.size, progress: 0, status: 'transferring', direction: 'upload' },
      ]);

      channel.send(
        JSON.stringify({
          type: 'file_header',
          id: transferId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        })
      );

      let offset = 0;
      let chunkStep = 0;
      while (offset < file.size) {
        if (cancelTransferFlagRef.current || channel.readyState !== 'open') {
          setTransfers((prev) => prev.map((t) => (t.id === transferId && t.status !== 'completed' ? { ...t, status: 'error' } : t)));
          return;
        }
        await waitForBufferedDrain(channel, highWaterMark);
        const slice = file.slice(offset, offset + chunkSize);
        const buf = await slice.arrayBuffer();
        channel.send(buf);
        offset += slice.size;
        chunkStep++;
        if (chunkStep % 8 === 0 || offset >= file.size) {
          const progress = file.size > 0 ? Math.min(99, Math.round((offset / file.size) * 100)) : 100;
          setTransfers((prev) => prev.map((t) => (t.id === transferId ? { ...t, progress } : t)));
        }
      }

      channel.send(JSON.stringify({ type: 'file_end', id: transferId }));
      setTransfers((prev) => prev.map((t) => (t.id === transferId ? { ...t, status: 'completed', progress: 100 } : t)));
    }
    selectedFilesRef.current = [];
  };

  const handleSignalingEvent = async (data: any, sock: Socket) => {
    const { senderIp, senderDeviceId, senderName, type, payload } = data;
    const peerKey = senderDeviceId || senderIp;
    const senderPeer =
      peersRef.current.find((p) => (senderDeviceId && p.deviceId === senderDeviceId) || p.ip === senderIp) ||
      { name: senderName || 'Unknown Peer', ip: senderIp, deviceId: senderDeviceId };

    if (type === 'transfer_request') {
      cancelTransferFlagRef.current = false;
      setIsTransferCancelled(false);
      setCompletedDownloads([]);
      setTransferTransport('webrtc');
      setIncomingRequest({
        senderIp,
        senderDeviceId: peerKey,
        senderName: senderPeer.name,
        files: payload.files,
        totalSize: payload.totalSize,
      });
      return;
    }

    if (type === 'transfer_accept') {
      setIsWaitingForReply(false);
      cancelTransferFlagRef.current = false;
      startActualDirectTransfer(peerKey, senderIp, senderPeer.name, sock);
      return;
    }

    if (type === 'transfer_reject') {
      setIsWaitingForReply(false);
      setIsTransferring(false);
      showToast(`${senderPeer.name} ปฏิเสธคำขอส่งไฟล์`, 'error');
      return;
    }

    if (type === 'transfer_cancel') {
      cancelTransferFlagRef.current = true;
      if (dataChannels.current[peerKey]) {
        try { dataChannels.current[peerKey].close(); } catch {}
        delete dataChannels.current[peerKey];
      }
      if (rtcConnections.current[peerKey]) {
        try { rtcConnections.current[peerKey].close(); } catch {}
        delete rtcConnections.current[peerKey];
      }
      setIsWaitingForReply(false);
      setIsTransferring(false);
      setIsTransferCancelled(true);
      return;
    }

    if (type === 'offer') {
      if (rtcConnections.current[peerKey]) {
        try { rtcConnections.current[peerKey].close(); } catch {}
        delete rtcConnections.current[peerKey];
      }
      const pc = initPeerConnection(peerKey, senderIp, sock, senderPeer.name);
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      if (iceCandidateQueues.current[peerKey]) {
        for (const cand of iceCandidateQueues.current[peerKey]) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
        }
        delete iceCandidateQueues.current[peerKey];
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sock.emit('webrtc_signaling', { targetDeviceId: senderDeviceId, targetIp: senderIp, type: 'answer', payload: answer });
      return;
    }

    if (!rtcConnections.current[peerKey]) {
      initPeerConnection(peerKey, senderIp, sock, senderPeer.name);
    }
    const pc = rtcConnections.current[peerKey];

    if (type === 'answer') {
      if (pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      if (iceCandidateQueues.current[peerKey]) {
        for (const cand of iceCandidateQueues.current[peerKey]) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
        }
        delete iceCandidateQueues.current[peerKey];
      }
    } else if (type === 'candidate') {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload)); } catch {}
      } else {
        if (!iceCandidateQueues.current[peerKey]) iceCandidateQueues.current[peerKey] = [];
        iceCandidateQueues.current[peerKey].push(payload);
      }
    }
  };

  const handleDirectRelayEvent = (data: any) => {
    const { senderIp, senderDeviceId, senderName, relayType } = data;
    const resolvedName =
      peersRef.current.find((p) => (senderDeviceId && p.deviceId === senderDeviceId) || p.ip === senderIp)?.name ||
      senderName ||
      'Peer';

    setTransferTransport('relay');

    if (relayType === 'file_header') {
      activeRelayTransferRef.current = { id: data.id, expectedBytes: Number(data.fileSize) || 0, receivedBytes: 0 };
      beginReceiveFile(data.id, data.fileName, Number(data.fileSize) || 0, data.fileType || 'application/octet-stream', resolvedName);
      return;
    }

    const relayTracker = activeRelayTransferRef.current;
    if (relayType === 'file_chunk' && relayTracker && relayTracker.id === data.id) {
      const bytes =
        data.chunk instanceof ArrayBuffer
          ? new Uint8Array(data.chunk)
          : data.chunk instanceof Uint8Array
            ? data.chunk
            : new Uint8Array(Object.values(data.chunk || {}));
      appendReceiveChunk(data.id, bytes, relayTracker);
      return;
    }

    if (relayType === 'file_end') {
      finalizeReceiveFile(data.id);
      activeRelayTransferRef.current = null;
    }
  };

  const handleDirectFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const validFiles: File[] = [];
      const oversizedNames: string[] = [];
      const MAX_SIZE = runtimeConfig.maxP2pFileBytes;

      newFiles.forEach((f) => {
        if (f.size > MAX_SIZE) oversizedNames.push(f.name);
        else validFiles.push(f);
      });

      setSelectedFiles((prev) => {
        const prevNames = new Set(prev.map((f) => f.name));
        const duplicateNames: string[] = [];
        validFiles.forEach((f) => {
          if (prevNames.has(f.name)) duplicateNames.push(f.name);
        });
        if (duplicateNames.length > 0) {
          setDuplicateFileNames(duplicateNames);
          setDuplicateCountdown(5);
        }

        const combined = [...prev, ...validFiles];
        const uniqueFiles = Array.from(new Map(combined.map((f) => [f.name, f])).values());

        let finalFiles = uniqueFiles;
        const errorMsgs: string[] = [];
        if (uniqueFiles.length > 10) {
          errorMsgs.push('คุณสามารถส่งไฟล์ได้สูงสุด 10 ไฟล์เท่านั้น');
          errorMsgs.push('ระบบได้เลือกเฉพาะ 10 ไฟล์แรก');
          finalFiles = uniqueFiles.slice(0, 10);
        }
        if (oversizedNames.length > 0) {
          errorMsgs.push(`ข้าม ${oversizedNames.length} ไฟล์ เนื่องจากมีขนาดเกิน ${runtimeConfig.maxP2pFileSizeMb}MB`);
        }

        if (errorMsgs.length > 0) {
          setFileError(errorMsgs.join('\n'));
          setErrorCountdown(5);
        }

        selectedFilesRef.current = finalFiles;
        return finalFiles;
      });
      e.target.value = '';
    }
  };

  const removeSelectedFile = (fileName: string) => {
    setSelectedFiles((prev) => {
      const newFiles = prev.filter((f) => f.name !== fileName);
      selectedFilesRef.current = newFiles;
      return newFiles;
    });
    setFileError("");
  };

  const openDirectSendModal = (peer: PeerInfo) => {
    setTargetPeer(peer);
    targetPeerRef.current = peer;
    setSelectedFiles([]);
    selectedFilesRef.current = [];
    setFileError("");
    setIsDirectSendModalOpen(true);
    setIsWaitingForReply(false);
  };

  const closeDirectSendModal = () => {
    if (isWaitingForReply && socket && targetPeer) {
      socket.emit('webrtc_signaling', {
        targetDeviceId: targetPeer.deviceId,
        targetIp: targetPeer.ip,
        type: 'transfer_cancel',
      });
    }
    if (targetPeer) {
      setTransfers((prev) => prev.filter((t) => !(t.peerName === targetPeer.name && t.direction === 'upload')));
    }
    cancelTransferFlagRef.current = true;
    setIsDirectSendModalOpen(false);
    setIsWaitingForReply(false);
    setIsTransferring(false);
    setIsTransferCancelled(false);
    setSelectedFiles([]);
    selectedFilesRef.current = [];
    setTargetPeer(null);
    targetPeerRef.current = null;
  };

  const startSendingFiles = () => {
    if (!targetPeer || !socket || selectedFiles.length === 0) return;
    cancelTransferFlagRef.current = false;
    setIsTransferCancelled(false);

    const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    const filesMeta = selectedFiles.map((f) => ({ name: f.name, size: f.size }));

    setIsWaitingForReply(true);
    socket.emit('webrtc_signaling', {
      targetDeviceId: targetPeer.deviceId,
      targetIp: targetPeer.ip,
      type: 'transfer_request',
      payload: { files: filesMeta, totalSize },
    });
  };

  const cancelOutgoingTransfer = () => {
    cancelTransferFlagRef.current = true;
    if (socket && targetPeer) {
      socket.emit('webrtc_signaling', {
        targetDeviceId: targetPeer.deviceId,
        targetIp: targetPeer.ip,
        type: 'transfer_cancel',
      });
    }
    setIsTransferCancelled(true);
  };

  const handleAcceptTransfer = () => {
    if (!incomingRequest || !socket) return;
    socket.emit('webrtc_signaling', {
      targetDeviceId: incomingRequest.senderDeviceId,
      targetIp: incomingRequest.senderIp,
      type: 'transfer_accept',
    });
    setIsReceiving(true);
  };

  const handleRejectTransfer = () => {
    if (!incomingRequest || !socket) return;
    socket.emit('webrtc_signaling', {
      targetDeviceId: incomingRequest.senderDeviceId,
      targetIp: incomingRequest.senderIp,
      type: 'transfer_reject',
    });
    setIncomingRequest(null);
  };

  const handleCancelReceiving = () => {
    if (incomingRequest) {
      const peerKey = incomingRequest.senderDeviceId || incomingRequest.senderIp;
      if (dataChannels.current[peerKey]) {
        try { dataChannels.current[peerKey].close(); } catch {}
        delete dataChannels.current[peerKey];
      }
      if (rtcConnections.current[peerKey]) {
        try { rtcConnections.current[peerKey].close(); } catch {}
        delete rtcConnections.current[peerKey];
      }
      if (socket) {
        socket.emit('webrtc_signaling', {
          targetDeviceId: incomingRequest.senderDeviceId,
          targetIp: incomingRequest.senderIp,
          type: 'transfer_cancel',
        });
      }
    }
    cancelTransferFlagRef.current = true;
    setIsTransferCancelled(true);
  };

  const closeReceiverModal = () => {
    if (incomingRequest) {
      setTransfers((prev) => prev.filter((t) => !(t.peerName === incomingRequest.senderName && t.direction === 'download')));
    }
    setCompletedDownloads([]);
    setIncomingRequest(null);
    setIsReceiving(false);
    setIsTransferCancelled(false);
  };

  return {
    isDirectSendModalOpen,
    targetPeer,
    selectedFiles,
    duplicateFileNames,
    duplicateCountdown,
    fileError,
    errorCountdown,
    isWaitingForReply,
    incomingRequest,
    transfers,
    isTransferring,
    isReceiving,
    isTransferCancelled,
    transferTransport,
    completedDownloads,
    handleSignalingEvent,
    handleDirectRelayEvent,
    handleDirectFileSelect,
    removeSelectedFile,
    openDirectSendModal,
    closeDirectSendModal,
    startSendingFiles,
    cancelOutgoingTransfer,
    handleAcceptTransfer,
    handleRejectTransfer,
    handleCancelReceiving,
    closeReceiverModal,
    closeAllConnections,
  };
}
