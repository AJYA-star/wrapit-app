const mongoose = require('mongoose');
const Order = require('../models/order');
const Shop = require('../models/shop');
const Message = require('../models/message');
const assistant = require('../services/assistant');

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

// If the shop owner wrote in the last 30 minutes, the owner has taken over and the assistant stays quiet.
const OWNER_TAKEOVER_MS = 30 * 60 * 1000;
// Safety limit so a chat can never run up the AI bill
const MAX_ASSISTANT_REPLIES_PER_DAY = 20;

const assistantActiveFor = (shop) =>
  assistant.isConfigured() && !!shop && shop.aiReplies !== false;

// Finds the order and works out which side of the chat the logged-in user is on.
// Returns { order, shop, side } where side is 'customer' or 'shop', or sends an error and returns null.
async function loadChat(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    fail(res, 404, 'Order not found');
    return null;
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    fail(res, 404, 'Order not found');
    return null;
  }

  const userId = req.user.id.toString();
  const shop = await Shop.findById(order.shop);

  if (order.customer.toString() === userId) return { order, shop, side: 'customer' };
  if (shop && shop.owner.toString() === userId) return { order, shop, side: 'shop' };

  fail(res, 403, 'You are not part of this chat');
  return null;
}

// ---------------------------------------------------------------- automatic assistant

const running = new Map(); // orderId -> true when another customer message arrived while we were replying

async function answerOnce(orderId) {
  const order = await Order.findById(orderId);
  if (!order) return;
  const shop = await Shop.findById(order.shop);
  if (!assistantActiveFor(shop)) return;

  const since = new Date(Date.now() - OWNER_TAKEOVER_MS);
  if (await Message.exists({ order: order._id, senderRole: 'shop', createdAt: { $gt: since } })) return;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sentToday = await Message.countDocuments({ order: order._id, senderRole: 'assistant', createdAt: { $gt: dayAgo } });
  if (sentToday >= MAX_ASSISTANT_REPLIES_PER_DAY) return;

  const recent = await Message.find({ order: order._id })
    .sort({ createdAt: -1 })
    .limit(12)
    .select('senderRole text');
  const history = recent.reverse().map(m => ({ senderRole: m.senderRole, text: m.text }));

  const text = await assistant.reply({ order, shop, history });
  if (!text) return;

  await Message.create({
    order: order._id,
    senderRole: 'assistant',
    senderName: 'Hadiya Assistant',
    text
  });
}

async function assistantReply(orderId) {
  const key = orderId.toString();
  if (running.has(key)) { running.set(key, true); return; }   // already replying: do one more round after
  running.set(key, false);
  try {
    do {
      running.set(key, false);
      await answerOnce(key);
    } while (running.get(key));
  } catch (error) {
    console.error('Assistant reply failed:', error.message);
  } finally {
    running.delete(key);
  }
}

// ---------------------------------------------------------------- endpoints

// GET /api/orders/:id/messages?after=<ISO date>
// Without "after" you get the whole conversation; with it only newer messages (used for refreshing).
// Opening the chat also marks it as read for the person who opened it.
exports.getMessages = async (req, res, next) => {
  try {
    const chat = await loadChat(req, res);
    if (!chat) return;

    const filter = { order: chat.order._id };
    if (req.query.after) {
      const after = new Date(req.query.after);
      if (!Number.isNaN(after.getTime())) filter.createdAt = { $gt: after };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: 1 })
      .limit(500)
      .select('senderRole senderName text createdAt');

    if (!req.query.after || messages.length) {
      await Order.updateOne({ _id: chat.order._id }, { $set: { ['chatRead.' + chat.side]: new Date() } });
    }

    res.status(200).json({
      success: true,
      side: chat.side,
      assistant: assistantActiveFor(chat.shop),
      messages
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/orders/:id/messages   body: { text }
exports.sendMessage = async (req, res, next) => {
  try {
    const chat = await loadChat(req, res);
    if (!chat) return;

    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) return fail(res, 400, 'Please type a message');
    if (text.length > 1000) return fail(res, 400, 'Message is too long (max 1000 characters)');

    const message = await Message.create({
      order: chat.order._id,
      sender: req.user.id,
      senderRole: chat.side,
      senderName: req.user.name,
      text
    });

    // Sending counts as having read the conversation up to now
    await Order.updateOne({ _id: chat.order._id }, { $set: { ['chatRead.' + chat.side]: new Date() } });

    res.status(201).json({
      success: true,
      message: {
        _id: message._id,
        senderRole: message.senderRole,
        senderName: message.senderName,
        text: message.text,
        createdAt: message.createdAt
      }
    });

    // After answering the request: let the assistant reply first to a customer's message
    if (chat.side === 'customer' && assistantActiveFor(chat.shop)) {
      assistantReply(chat.order._id);
    }
  } catch (error) {
    next(error);
  }
};

// GET /api/orders/unread  ->  { total, orders: { <orderId>: <number of unread messages> } }
exports.getUnread = async (req, res, next) => {
  try {
    const userId = req.user.id;
    let side = 'customer';
    let orderFilter = { customer: userId };

    if (req.user.role === 'shop_owner' || req.user.role === 'admin') {
      const shop = await Shop.findOne({ owner: userId });
      if (shop) {
        side = 'shop';
        orderFilter = { shop: shop._id };
      }
    }

    const orders = await Order.find(orderFilter).select('chatRead').lean();
    if (!orders.length) return res.status(200).json({ success: true, total: 0, orders: {} });

    // Customers hear from the shop and the assistant; the shop hears from customers
    const fromRoles = side === 'shop' ? ['customer'] : ['shop', 'assistant'];
    const readAt = {};
    orders.forEach(o => { readAt[o._id.toString()] = o.chatRead && o.chatRead[side] ? new Date(o.chatRead[side]) : null; });

    const messages = await Message.find({
      order: { $in: orders.map(o => o._id) },
      senderRole: { $in: fromRoles }
    }).select('order createdAt').lean();

    const counts = {};
    let total = 0;
    messages.forEach(m => {
      const id = m.order.toString();
      const seenAt = readAt[id];
      if (!seenAt || m.createdAt > seenAt) {
        counts[id] = (counts[id] || 0) + 1;
        total += 1;
      }
    });

    res.status(200).json({ success: true, total, orders: counts });
  } catch (error) {
    next(error);
  }
};
