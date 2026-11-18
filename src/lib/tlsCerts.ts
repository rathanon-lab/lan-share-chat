import fs from 'fs';
import net from 'net';
import path from 'path';
import forge from 'node-forge';

export interface TlsCertificateBundle {
  keyPem: string;
  certPem: string;
  caCertPem: string;
  caCertPath: string;
  sanIps: string[];
}

function randomSerial(): string {
  const bytes = forge.random.getBytesSync(12);
  // Ensure positive ASN.1 integer by keeping the MSB bit 0 (0x01..0x7f)
  const first = (bytes.charCodeAt(0) & 0x7f) || 1;
  return first.toString(16).padStart(2, '0') + forge.util.bytesToHex(bytes.slice(1));
}

function generateRootCa(): { caKeyPem: string; caCertPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerial();
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter = new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000);

  const attrs = [
    { name: 'commonName', value: 'LAN Share Local Root CA' },
    { name: 'organizationName', value: 'LAN Share Chat' },
    { name: 'countryName', value: 'TH' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    caKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    caCertPem: forge.pki.certificateToPem(cert),
  };
}

function generateServerCert(
  caKeyPem: string,
  caCertPem: string,
  sanIps: string[],
  sanDomains: string[]
): { keyPem: string; certPem: string } {
  const caKey = forge.pki.privateKeyFromPem(caKeyPem);
  const caCert = forge.pki.certificateFromPem(caCertPem);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerial();
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // Apple/Safari strictly rejects TLS leaf certificates valid > 398 days
  cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  cert.setSubject([
    { name: 'commonName', value: sanIps[0] || 'localhost' },
    { name: 'organizationName', value: 'LAN Share Chat Server' },
  ]);
  cert.setIssuer(caCert.subject.attributes);

  const altNames: any[] = [
    ...sanDomains.map((d) => ({ type: 2, value: d })), // DNS
    ...sanIps.map((ip) => ({ type: 7, ip })), // IP
  ];

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
    { name: 'subjectAltName', altNames },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(caKey, forge.md.sha256.create());

  return {
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
  };
}

/**
 * Ensures a cached Root CA + SAN Server Certificate exist under storage/certs/.
 * Accepts IP addresses and/or DNS hostnames and regenerates the leaf cert if SAN targets change.
 */
export function ensureLanTlsCertificates(lanTargets: string[]): TlsCertificateBundle {
  const certsDir = path.resolve(process.cwd(), 'storage', 'certs');
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const caKeyPath = path.join(certsDir, 'ca-key.pem');
  const caCertPath = path.join(certsDir, 'ca-cert.crt');
  const srvKeyPath = path.join(certsDir, 'server-key.pem');
  const srvCertPath = path.join(certsDir, 'server-cert.pem');
  const sanMetaPath = path.join(certsDir, 'san-ips.json');

  const parsedIps: string[] = [];
  const parsedDomains: string[] = [];
  for (const raw of lanTargets) {
    const entry = raw.trim();
    if (!entry) continue;
    if (net.isIP(entry)) {
      parsedIps.push(entry);
    } else {
      parsedDomains.push(entry);
    }
  }

  const uniqueIps = Array.from(new Set(['127.0.0.1', '::1', ...parsedIps]));
  const sanDomains = Array.from(new Set(['localhost', 'lanshare.local', ...parsedDomains]));
  const sanTargets = [...uniqueIps, ...sanDomains];

  let caKeyPem = '';
  let caCertPem = '';
  if (fs.existsSync(caKeyPath) && fs.existsSync(caCertPath)) {
    caKeyPem = fs.readFileSync(caKeyPath, 'utf8');
    caCertPem = fs.readFileSync(caCertPath, 'utf8');
  } else {
    const ca = generateRootCa();
    caKeyPem = ca.caKeyPem;
    caCertPem = ca.caCertPem;
    fs.writeFileSync(caKeyPath, caKeyPem, 'utf8');
    fs.writeFileSync(caCertPath, caCertPem, 'utf8');
  }

  let cachedIps: string[] = [];
  if (fs.existsSync(sanMetaPath)) {
    try {
      cachedIps = JSON.parse(fs.readFileSync(sanMetaPath, 'utf8'));
    } catch {
      cachedIps = [];
    }
  }

  const ipsChanged = sanTargets.some((target) => !cachedIps.includes(target));
  let exceedsAppleValidity = false;
  if (fs.existsSync(srvCertPath)) {
    try {
      const existing = forge.pki.certificateFromPem(fs.readFileSync(srvCertPath, 'utf8'));
      const validDays = (existing.validity.notAfter.getTime() - existing.validity.notBefore.getTime()) / (24 * 60 * 60 * 1000);
      if (validDays > 390) exceedsAppleValidity = true;
    } catch {
      exceedsAppleValidity = true;
    }
  }
  if (!fs.existsSync(srvKeyPath) || !fs.existsSync(srvCertPath) || ipsChanged || exceedsAppleValidity) {
    const srv = generateServerCert(caKeyPem, caCertPem, uniqueIps, sanDomains);
    fs.writeFileSync(srvKeyPath, srv.keyPem, 'utf8');
    fs.writeFileSync(srvCertPath, srv.certPem, 'utf8');
    fs.writeFileSync(sanMetaPath, JSON.stringify(sanTargets, null, 2), 'utf8');
  }

  return {
    keyPem: fs.readFileSync(srvKeyPath, 'utf8'),
    certPem: fs.readFileSync(srvCertPath, 'utf8'),
    caCertPem,
    caCertPath,
    sanIps: uniqueIps,
  };
}
