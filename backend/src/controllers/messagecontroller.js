const mongoose = require('mongoose');
const Order = require('../models/order');
const Shop = require('../models/shop');
const Message = require('../models/message');

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

// Finds the order and works out which side of the chat the logged-in user is on.
// Returns { order, side } where side is 'customer' or 'shop', or sends an error and returns null.
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

  if (order.customer.toString() === userId) return { order, side: 'customer' };

  const shop = await Shop.findById(order.shop);
  if (shop && shop.owner.toString() === userId) return { order, side: 'shop' };

  fail(res, 403, 'You are not part of this chat');
  return null;
}

// GET /api/orders/:id/messages?after=<ISO date>
// Without "after" you get the whole conversation; with it only newer messages (used for refreshing).
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

    res.status(200).json({
      success: true,
      side: chat.side,
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
  } catch (error) {
    next(error);
  }
};
