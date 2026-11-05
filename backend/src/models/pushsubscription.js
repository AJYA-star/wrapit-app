const mongoose = require('mongoose');

// One row per phone / browser that agreed to receive notifications.
const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },   // the browser's private "mailbox" address
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  lang: { type: String, enum: ['en', 'ar'], default: 'en' }   // notification language
}, { timestamps: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
