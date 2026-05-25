const webpush = require('web-push');
const pool = require('./db/pool');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@cargo-transport.local';

let pushEnabled = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  pushEnabled = true;
  console.log('Web Push enabled');
} else {
  console.log('Web Push disabled — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars');
  console.log('Generate keys with: npx web-push generate-vapid-keys');
}

function getPublicKey() {
  return VAPID_PUBLIC;
}

async function saveSubscription(userId, subscription) {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys_p256dh = $3, keys_auth = $4`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
}

async function removeSubscription(endpoint) {
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

async function notifyUser(userId, title, body, url) {
  if (!pushEnabled) return;
  try {
    const result = await pool.query(
      'SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    const payload = JSON.stringify({ title, body, url });
    for (const row of result.rows) {
      const sub = { endpoint: row.endpoint, keys: { p256dh: row.keys_p256dh, auth: row.keys_auth } };
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
        }
      }
    }
  } catch {}
}

async function notifyRequestStatusChange(requestId, newStatus) {
  if (!pushEnabled) return;
  try {
    const result = await pool.query('SELECT sender_id, receiver_id FROM transport_requests WHERE id = $1', [requestId]);
    if (!result.rows.length) return;
    const { sender_id, receiver_id } = result.rows[0];

    const STATUS_LABELS = { assigned: 'Назначена', in_progress: 'В пути', delivered: 'Доставлена', confirmed: 'Подтверждена', rejected: 'Отклонена' };
    const label = STATUS_LABELS[newStatus] || newStatus;
    const title = `Заявка #${requestId}`;
    const body = `Статус изменён: ${label}`;
    const url = `/`;

    const userIds = new Set();
    if (sender_id) userIds.add(sender_id);
    if (receiver_id) userIds.add(receiver_id);

    for (const uid of userIds) {
      await notifyUser(uid, title, body, url);
    }
  } catch {}
}

module.exports = { getPublicKey, saveSubscription, removeSubscription, notifyUser, notifyRequestStatusChange };
