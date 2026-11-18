import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { ensureLanTlsCertificates } from './src/lib/tlsCerts';
import { ensureBuiltInStickerPacks } from './src/lib/stickerStore';
import { isDevMode, port, uploadsDir } from './server/config';
import {
  getLocalIp,
  getPublicHost,
  setIoRef,
  setTlsRuntimeInfo,
} from './server/state';
import { handlePublicAndUserApi } from './server/routes/userRoutes';
import { handleAdminApi } from './server/routes/adminRoutes';
import { registerSocketHandlers } from './server/socket/registerHandlers';
import { initializeEnvironmentDiagnostics } from './server/utils/ffmpegCompat';

const app = next({ dev: isDevMode });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(async () => {
    await ensureBuiltInStickerPacks().catch((err) => {
      console.warn('[Stickers] Built-in pack seed warning:', err);
    });
    const ffmpegCap = await initializeEnvironmentDiagnostics();

    const localIp = getLocalIp();
    const publicHost = getPublicHost(localIp);
    const desiredHttpsPort = parseInt(process.env.HTTPS_PORT || String(port === 80 ? 3443 : port + 1000), 10);

    let tlsBundle: ReturnType<typeof ensureLanTlsCertificates> | null = null;
    if (process.env.ENABLE_LOCAL_HTTPS === '1' && desiredHttpsPort > 0) {
      try {
        const certTargets = publicHost !== localIp ? [localIp, publicHost] : [localIp];
        tlsBundle = ensureLanTlsCertificates(certTargets);
        setTlsRuntimeInfo(null, tlsBundle.caCertPem);
      } catch (certErr) {
        console.warn('[TLS] Failed to generate LAN HTTPS certs:', certErr);
      }
    }

    const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
      const parsedUrl = parse(req.url!, true);
      const pathname = parsedUrl.pathname || '/';

      if (pathname.startsWith('/api/admin/')) {
        const handled = await handleAdminApi(req, res, pathname);
        if (handled) return;
      }

      if (pathname.startsWith('/uploads/') || pathname.startsWith('/api/')) {
        const handled = await handlePublicAndUserApi(req, res, pathname, parsedUrl.query as Record<string, string | string[] | undefined>);
        if (handled) return;
      }

      handle(req, res, parsedUrl);
    };

    const server = createServer(requestHandler);
    const httpsServer = tlsBundle
      ? createHttpsServer({ key: tlsBundle.keyPem, cert: tlsBundle.certPem }, requestHandler)
      : null;

    const io = new SocketIOServer(server, {
      maxHttpBufferSize: 2 * 1024 * 1024,
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
    if (httpsServer) {
      io.attach(httpsServer);
    }

    setIoRef(io);
    registerSocketHandlers(io);

    server.listen(port, '0.0.0.0', () => {
      const modeLabel = isDevMode
        ? 'DEVELOPMENT (Not built — HTTP Quick Mode)'
        : 'PRODUCTION (Built — Pure HTTP Backend)';
      const proxyHint =
        process.env.PUBLIC_HTTPS_URL?.trim() ||
        (process.env.PUBLIC_HOST?.trim() ? `https://${publicHost} (Reverse Proxy HTTPS)` : null);

      console.log('====================================================================');
      console.log(`> LAN Share Chat v3.0 [${modeLabel}]`);
      console.log(`> Local HTTP   : http://localhost:${port}`);
      console.log(`> LAN HTTP     : http://${publicHost}:${port}`);
      if (proxyHint) {
        console.log(`> Proxy HTTPS  : ${proxyHint}`);
      }
      console.log(`> Admin Panel  : http://${publicHost}:${port}/admin`);
      console.log('> Features     : Chat=ON | Vault=ON | P2P=ON | UnifiedEmoji=ON | Stickers=ON');
      console.log(`> Storage Dir  : ${uploadsDir}`);
      console.log(
        `> Video FFmpeg : ${
          ffmpegCap.available
            ? `READY (${ffmpegCap.source === 'env' ? process.env.FFMPEG_PATH : 'System PATH'})`
            : 'NOT FOUND (Audio-only fallback for HEVC/H.265 in unsupported browsers)'
        }`
      );
      console.log('====================================================================');
    });

    if (httpsServer) {
      httpsServer.on('error', (err: Error) => {
        console.warn(`[TLS] HTTPS server skipped on port ${desiredHttpsPort}:`, err?.message || err);
      });
      httpsServer.listen(desiredHttpsPort, '0.0.0.0', () => {
        setTlsRuntimeInfo(desiredHttpsPort, tlsBundle?.caCertPem || null);
        console.log(`> Optional HTTPS Ready on https://${publicHost}:${desiredHttpsPort}`);
      });
    }
  })
  .catch((err) => {
    console.error('Error starting server:', err);
    process.exit(1);
  });
