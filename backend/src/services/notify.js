// Sends phone notifications to a user (all of their registered devices).
// It never throws and never blocks an order or a chat message: failures are only logged.
const PushSubscription = require('../models/pushsubscription');
const webpush = require('./webpush');

const STATUS_AR = {
  accepted: 'تم قبول طلبك', in_progress: 'جارٍ تغليف هديتك', ready: 'هديتك جاهزة',
  out_for_delivery: 'هديتك في الطريق إليك', completed: 'تم تسليم طلبك', cancelled: 'تم إلغاء طلبك', rejected: 'تم رفض طلبك'
};
const STATUS_EN = {
  accepted: 'Your order was accepted', in_progress: 'Your gift is being wrapped', ready: 'Your gift is ready',
  out_for_delivery: 'Your gift is on its way', completed: 'Your order is complete', cancelled: 'Your order was cancelled', rejected: 'Your order was rejected'
};

const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// What each event looks like, in each language
const EVENTS = {
  new_order: (d, ar) => ({
    title: ar ? 'طلب جديد 🎁' : 'New order 🎁',
    body: clip(d.service, 60) + (d.total != null ? (ar ? ' · ' + d.total + ' درهم' : ' · AED ' + d.total) : ''),
    url: 'shop-owner-dashboard.html', tag: 'order-' + d.orderId
  }),
  order_cancelled_by_customer: (d, ar) => ({
    title: ar ? 'تم إلغاء طلب' : 'Order cancelled',
    body: clip(d.service, 60), url: 'shop-owner-dashboard.html', tag: 'order-' + d.orderId
  }),
  order_status: (d, ar) => ({
    title: ar ? 'تحديث على طلبك' : 'Order update',
    body: (ar ? STATUS_AR : STATUS_EN)[d.status] || (ar ? 'تم تحديث طلبك' : 'Your order was updated'),
    url: 'my-orders.html', tag: 'order-' + d.orderId
  }),
  chat_message: (d, ar) => ({
    title: (ar ? 'رسالة جديدة من ' : 'New message from ') + clip(d.from || (ar ? 'المحادثة' : 'the chat'), 40),
    body: clip(d.text, 90), url: 'chat.html?order=' + d.orderId, tag: 'chat-' + d.orderId
  })
};

async function notifyUser(userId, event, data) {
  try {
    if (!webpush.isConfigured() || !userId) return;
    const build = EVENTS[event];
    if (!build) return;
    const subs = await PushSubscription.find({ user: userId });
    await Promise.all(subs.map(async (sub) => {
      const payload = build(data || {}, sub.lang === 'ar');
      const result = await webpush.send(sub, payload);
      if (result.gone) await PushSubscription.deleteOne({ _id: sub._id });   // phone no longer wants alerts
      else if (!result.ok) console.warn('Push failed (' + result.status + ')');
    }));
  } catch (error) {
    console.error('notifyUser failed:', error.message);
  }
}

module.exports = { notifyUser };
