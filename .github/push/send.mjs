// Manda el "toque" diario al iPhone. No lleva datos: el mensaje lo arma la app en el teléfono.
// La dirección del iPhone está cifrada en subscription.enc.json; solo se abre con VAPID_PRIVATE_KEY.
import webpush from 'web-push';
import { createDecipheriv, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const FILE = new URL('./subscription.enc.json', import.meta.url);

function fail(msg) { console.error(msg); process.exit(1); }

if (!VAPID_PRIVATE_KEY) fail('Falta el secreto VAPID_PRIVATE_KEY en GitHub (Settings, Secrets and variables, Actions).');
if (!existsSync(FILE)) fail('Todavía no hay un iPhone registrado: falta el archivo subscription.enc.json.');

let subscription;
try {
  const box = JSON.parse(readFileSync(FILE, 'utf8'));
  const key = createHash('sha256').update(VAPID_PRIVATE_KEY.trim()).digest();
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  subscription = JSON.parse(Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8'));
} catch {
  fail('El secreto VAPID_PRIVATE_KEY no coincide con el que se usó para registrar el iPhone. Vuelve a pegarlo exactamente como te lo dieron.');
}

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.trim());
  const res = await webpush.sendNotification(subscription, null, { TTL: 6 * 60 * 60, urgency: 'high' });
  console.log('Aviso enviado. Respuesta del servicio de avisos: ' + res.statusCode);
} catch (err) {
  if (err.statusCode === 404 || err.statusCode === 410) {
    fail('El iPhone ya no acepta este registro (se reinstaló la app o se desactivaron los avisos). Activa los avisos de nuevo en la app y vuelve a registrar el código.');
  }
  fail('No se pudo enviar el aviso: ' + (err.statusCode || '') + ' ' + (err.body || err.message));
}
