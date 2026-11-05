// Web Push without any extra package: only Node's built-in "crypto" and fetch.
//   - encryption: RFC 8291 (aes128gcm)
//   - sender identity: VAPID, RFC 8292 (a signed token proving the message comes from this server)
// Needs two environment variables (see README-PUSH.txt):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY      (and optionally VAPID_SUBJECT)
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (str) => Buffer.from(String(str), 'base64url');

const isConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

// Only genuine browser push services may be contacted (stops anyone using this server to call other addresses)
const ALLOWED_HOSTS = [
  /(^|\.)googleapis\.com$/,            // Chrome / Edge / Android (FCM)
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)push\.apple\.com$/,           // Safari / iPhone
  /(^|\.)notify\.windows\.com$/        // Windows (Edge)
];
function isAllowedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch (e) {
    return false;
  }
}

// ---- VAPID: signed token (JWT, ES256) -----------------------------------------------------
function vapidHeader(endpoint, now = Date.now()) {
  const pub = fromB64u(process.env.VAPID_PUBLIC_KEY);
  const priv = fromB64u(process.env.VAPID_PRIVATE_KEY);
  const key = crypto.createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(priv) }
  });
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: process.env.VAPID_SUBJECT || 'https://ajya-star.github.io/wrapit-pwa/'
  }));
  const signature = crypto.sign('sha256', Buffer.from(header + '.' + claims), { key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + header + '.' + claims + '.' + b64u(signature) + ', k=' + b64u(pub);
}

// ---- Encryption of the message (RFC 8291) --------------------------------------------------
// "options" (ephemeral key, salt) exist only so the tests can use the official test vector.
function encrypt(payload, subscription, options = {}) {
  const uaPublic = fromB64u(subscription.keys.p256dh);   // the browser's public key (65 bytes)
  const authSecret = fromB64u(subscription.keys.auth);   // the browser's secret (16 bytes)

  const ecdh = crypto.createECDH('prime256v1');
  if (options.ephemeralPrivate) ecdh.setPrivateKey(fromB64u(options.ephemeralPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const salt = options.salt ? fromB64u(options.salt) : crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = last (only) record
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, encrypted]);
}

// Sends one notification. Returns { ok, status, gone }  (gone = the browser dropped the subscription)
async function send(subscription, payloadObject, { ttl = 86400, urgency = 'high' } = {}) {
  if (!isConfigured()) return { ok: false, status: 0, gone: false };
  if (!isAllowedEndpoint(subscription.endpoint)) return { ok: false, status: 0, gone: true };

  const body = encrypt(JSON.stringify(payloadObject), subscription);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(subscription.endpoint),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: urgency
      },
      body,
      signal: controller.signal
    });
    return { ok: response.status >= 200 && response.status < 300, status: response.status, gone: response.status === 404 || response.status === 410 };
  } catch (error) {
    return { ok: false, status: 0, gone: false };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, isAllowedEndpoint, encrypt, vapidHeader, send };
