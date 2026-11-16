// Manda el "toque" diario al iPhone. No lleva datos: el mensaje lo arma la app en el teléfono.
import webpush from 'web-push';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION, VAPID_SUBJECT } = process.env;

const missing = Object.entries({ VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION }).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('Faltan secretos en GitHub: ' + missing.join(', ') + '. Agrégalos en Settings, Secrets and variables, Actions.');
  process.exit(1);
}

let subscription;
try {
  subscription = JSON.parse(PUSH_SUBSCRIPTION);
  if (!subscription.endpoint) throw new Error('sin endpoint');
} catch {
  console.error('PUSH_SUBSCRIPTION no es la clave completa. Cópiala de nuevo en la app: Historial, Copiar clave del iPhone.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

try {
  const res = await webpush.sendNotification(subscription, null, { TTL: 6 * 60 * 60, urgency: 'high' });
  console.log('Aviso enviado. Respuesta del servicio de avisos: ' + res.statusCode);
} catch (err) {
  if (err.statusCode === 404 || err.statusCode === 410) {
    console.error('El iPhone ya no acepta esta clave (se reinstaló la app o se desactivaron los avisos). Activa los avisos de nuevo en la app y actualiza PUSH_SUBSCRIPTION.');
  } else {
    console.error('No se pudo enviar el aviso: ' + (err.statusCode || '') + ' ' + (err.body || err.message));
  }
  process.exit(1);
}
