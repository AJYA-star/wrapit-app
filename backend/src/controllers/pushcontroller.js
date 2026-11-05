const PushSubscription = require('../models/pushsubscription');
const webpush = require('../services/webpush');

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const MAX_DEVICES_PER_USER = 8;

// GET /api/push/key  (public) - the browser needs the public key to register
exports.getKey = (req, res) => {
  if (!webpush.isConfigured()) {
    // names only (never values): tells the site owner which Render variable is missing
    const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].filter((name) => !process.env[name]);
    return res.status(200).json({ success: true, enabled: false, missing });
  }
  res.status(200).json({ success: true, enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY });
};

// POST /api/push/subscribe   { subscription: { endpoint, keys: { p256dh, auth } }, lang }
exports.subscribe = async (req, res, next) => {
  try {
    if (!webpush.isConfigured()) return fail(res, 503, 'Notifications are not set up yet');
    const sub = req.body && req.body.subscription;
    const endpoint = sub && sub.endpoint;
    const keys = sub && sub.keys;
    if (typeof endpoint !== 'string' || endpoint.length > 1000 || !webpush.isAllowedEndpoint(endpoint)) {
      return fail(res, 400, 'This browser cannot receive notifications');
    }
    if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) {
      return fail(res, 400, 'This browser cannot receive notifications');
    }
    const lang = req.body.lang === 'ar' ? 'ar' : 'en';

    // same phone, new account (or the same one again): the newest login owns the registration
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { user: req.user.id, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, lang },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // keep only the newest devices per user
    const mine = await PushSubscription.find({ user: req.user.id }).sort({ updatedAt: -1 }).select('_id');
    if (mine.length > MAX_DEVICES_PER_USER) {
      await PushSubscription.deleteMany({ _id: { $in: mine.slice(MAX_DEVICES_PER_USER).map((s) => s._id) } });
    }

    res.status(201).json({ success: true, message: 'Notifications are on' });
  } catch (error) {
    next(error);
  }
};

// POST /api/push/unsubscribe   { endpoint }
exports.unsubscribe = async (req, res, next) => {
  try {
    const endpoint = req.body && req.body.endpoint;
    if (typeof endpoint === 'string') await PushSubscription.deleteOne({ endpoint, user: req.user.id });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
