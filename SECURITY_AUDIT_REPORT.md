# Security Audit & Patch Report (November 2026)

**Scope:** `Server-Lab-A2` (`192.168.1.5`, Edge Reverse Proxy & Host Kernel) and `lan-share-chat` (`v3.1.0`, Next.js Custom Server)

---

## 1. Executive Summary

| Component | Vulnerability / Check | Finding Before Patch | Action Taken | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`lab-a2-npm` (`jc21/nginx-proxy-manager`)** | **CVE-2026-123007 ("nginx2root", CVSS 9.2)** | Running `v2.17.0` (`openresty/1.31.8.1`, built `2026-11-15`) with `http2 on;` on 9 hosts (`*.lab.lan`) | Pulled official `v2.17.1` (`2026-11-19`, `openresty-1.31.8.1+backports`) with upstream `nginx2root` fix and recreated `lab-a2-npm` | **PATCHED** |
| **Linux Host Kernel (`192.168.1.5` Photon OS)** | **SCTP Privilege Escalation Chain (`nginx2root`)** | `sctp` sysctl inactive, `/etc/modprobe.d/disable-sctp.conf` absent | Created `/etc/modprobe.d/disable-sctp.conf` (`install sctp /bin/false`) | **HARDENED** |
| **Apache Roller (`CVE-2026-129448`)** | Tomcat / Apache Roller Java RCE | No Tomcat, Roller, or Java binaries on host or active containers | No action required | **NOT AFFECTED** |
| **PHP (`CVE-2026-115560` / `109618` / `109619`)** | PHP2Shell / `upload_progress` RCE | No PHP present on host or running containers (`freepbx` container is `Exited`) | Verified clean on all running web services | **NOT AFFECTED** |
| **Network Exposure (`192.168.1.5`)** | External / Public Internet Exposure | No external tunnel daemons (`cloudflared`, `ngrok`, `tailscale`, `wireguard`, `frpc`); ISP CGNAT isolates LAN | Verified strictly internal (`192.168.1.0/24`) | **ISOLATED** |
| **`lan-share-chat` (`next`, `multer`, `engine.io`, `nanoid`, `undici`)** | Next.js `16.2.12` (1 Critical, 7 High prod advisories) | `next@16.2.12` (`<= 16.4.4`), `multer <= 2.4.0`, `engine.io 6.6.0-6.6.9` | Upgraded to `next@16.4.6`, `eslint-config-next@16.4.6`, and ran `npm audit fix` (`0 vulnerabilities`) | **PATCHED** |

---

## 2. Detailed Verification Notes

### A. Reverse Proxy (`lab-a2-npm`)
- Verified `NginxProxyManager/nginx-proxy-manager` official GitHub release **`v2.17.1`** (`published_at: 2026-11-19T03:10:53Z`) bundles **`openresty-1.31.8.1+backports`** containing backported fixes for [nginx2root](https://nginx2root.com/) (`CVE-2026-123007`).
- Recreated `lab-a2-npm` on `192.168.1.5` to `v2.17.1` (`sha256:04a9d0835560b9719ab577275f84fe1f713298a1c1e2bdefa034b87f10e062e1`) and updated `Server-Lab-A2/docker-compose.yml` image tag to `jc21/nginx-proxy-manager:2.17.1` (`>= 2.17.1` safe baseline).

### B. Next.js Application (`lan-share-chat v3.1.0`)
- Audited `src/` prior to upgrade: zero usage of `'use server'`, `'use cache'`, or `next/image`.
- Upgraded `next` and `eslint-config-next` from `16.2.12` to `16.4.6` (`--save-exact`) and ran `npm audit fix`.
- Confirmed `npm audit --omit=dev` and `npm audit` both report **`found 0 vulnerabilities`**.
- Verified `npx tsc --noEmit`, `npm run build` (`Next.js 16.4.6 Turbopack`), Windows E2E Matrix (`10/10 PASSED`), and live Docker endpoints (`https://chat.lab.lan`, `https://bot.lab.lan`).
