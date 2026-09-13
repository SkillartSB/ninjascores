// Envoi de notifications push natives iOS via APNs (HTTP/2 + JWT ES256).
// Utilisé uniquement par api/push-goals.js. Nécessite une clé d'authentification
// APNs (.p8) générée depuis un compte Apple Developer payant — voir le README
// du dossier ios-app/ pour la procédure. Tant que les variables d'env ne sont
// pas renseignées, apnsConfigured() renvoie false et l'appelant saute l'envoi
// sans planter le cron (les notifications web restent actives).

import http2 from 'node:http2';
import jwt from 'jsonwebtoken';

let cachedToken = null;
let cachedTokenAt = 0;

function requiredEnv() {
  return ['APNS_KEY_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID'];
}

// Les valeurs sont systematiquement rognees. Une variable d'environnement
// saisie a la main ou collee depuis un terminal arrive facilement avec un
// retour a la ligne final ; APNS_ENV etant compare par egalite stricte a
// « production », un seul caractere invisible suffirait a router tous les
// envois vers le sandbox, ou chaque token de production est rejete en
// BadDeviceToken. La panne serait totale et parfaitement silencieuse.
function env(cle) {
  return (process.env[cle] || '').trim();
}

export function apnsConfigured() {
  return requiredEnv().every((k) => !!env(k));
}

function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  // Un token JWT APNs reste valide 1h max côté Apple ; on le regénère au
  // bout de 30 min pour rester large.
  if (cachedToken && now - cachedTokenAt < 1800) return cachedToken;
  const privateKey = env('APNS_KEY_P8').replace(/\\n/g, '\n');
  cachedToken = jwt.sign(
    { iss: env('APNS_TEAM_ID'), iat: now },
    privateKey,
    { algorithm: 'ES256', keyid: env('APNS_KEY_ID') }
  );
  cachedTokenAt = now;
  return cachedToken;
}

function apnsHost() {
  return env('APNS_ENV') === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
}

// Envoie la même notif à plusieurs device tokens sur une connexion HTTP/2
// unique (recommandé par Apple plutôt qu'une connexion par requête).
// Retourne, pour chaque token, { deviceToken, ok, status, invalid } — invalid
// signale un token mort (BadDeviceToken / Unregistered) à supprimer côté
// appelant.
export function sendApnsBatch(deviceTokens, { title, body, fixtureId, url, tag }) {
  if (!deviceTokens.length) return Promise.resolve([]);
  const token = providerToken();
  const payload = JSON.stringify({
    // thread-id : iOS regroupe les notifications d'un meme match.
    aps: { alert: { title, body }, sound: 'default', 'thread-id': fixtureId ? 'match-' + fixtureId : undefined },
    fixtureId, url: url || null, tag: tag || null,
  });

  return new Promise((resolve) => {
    const client = http2.connect(apnsHost());
    client.on('error', () => resolve(deviceTokens.map((deviceToken) => ({ deviceToken, ok: false, status: 0 }))));

    const resultats = [];
    let restants = deviceTokens.length;

    const finir = () => {
      restants--;
      if (restants <= 0) { client.close(); resolve(resultats); }
    };

    deviceTokens.forEach((deviceToken) => {
      const req = client.request({
        ':method': 'POST',
        ':path': '/3/device/' + deviceToken,
        authorization: 'bearer ' + token,
        'apns-topic': env('APNS_BUNDLE_ID'),
        'apns-push-type': 'alert',
        'content-type': 'application/json',
        // meme tag = meme collapse-id : la notification du buteur remplace celle du but
        ...(tag ? { 'apns-collapse-id': String(tag).slice(0, 64) } : {}),
      });
      let status = 0;
      let corps = '';
      req.on('response', (headers) => { status = headers[':status']; });
      req.setEncoding('utf8');
      req.on('data', (chunk) => { corps += chunk; });
      req.on('end', () => {
        const invalid = status === 400 || status === 410;
        resultats.push({ deviceToken, ok: status === 200, status, invalid, body: corps });
        finir();
      });
      req.on('error', () => {
        resultats.push({ deviceToken, ok: false, status: 0, invalid: false });
        finir();
      });
      req.end(payload);
    });
  });
}
