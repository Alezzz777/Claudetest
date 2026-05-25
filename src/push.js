const webpush = require('web-push');
const pool = require('./db/pool');

const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@cargo-transport.local';

let pushEnabled = false;
let vapidPublic = '';

async function init() {
  let pub = process.env.VAPID_PUBLIC_KEY || '';
  let priv = process.env.VAPID_PRIVATE_KEY || '';

  if (!pub || !priv) {
    try {
      const existing = await pool.query(
        "SELECT key, value FROM app_settings WHERE key IN ('vapid_public', 'vapid_private')"
      );
      const map = {};
      existing.rows.forEach(r => { map[r.key] = r.value; });

      if (map.vapid_public && map.vapid_private) {
        pub = map.vapid_public;
        priv = map.vapid_private;
        console.log('VAPID keys loaded from database');
      } else {
        const keys = webpush.generateVAPIDKeys();
        pub = keys.publicKey;
        priv = keys.privateKey;
        await pool.query(
          `INSERT INTO app_settings (key, value) VALUES ('vapid_public', $1), ('vapid_private', $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [pub, priv]
        );
        console.log('VAPID keys generated and saved to database');
      }
    } catch (err) {
      console.log('Web Push disabled — database not available for VAPID key storage:', err.message);
      return;
    }
  }

  try {
    webpush.setVapidDetails(VAPID_EMAIL, pub, priv);
    vapidPublic = pub;
    pushEnabled = true;
    console.log('Web Push enabled');
  } catch (err) {
    console.log('Web Push init error:', err.message);
  }
}

function getPublicKey() {
  return vapidPublic;
}

function isEnabled() {
  return pushEnabled;
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

module.exports = { init, getPublicKey, isEnabled, saveSubscription, removeSubscription, notifyUser, notifyRequestStatusChange };
