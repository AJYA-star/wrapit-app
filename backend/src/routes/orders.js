const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getShopOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder
} = require('../controllers/ordercontroller');
const { getMessages, sendMessage, getUnread } = require('../controllers/messagecontroller');
const rateLimit = require('express-rate-limit');
const { protect, restrictTo } = require('../middleware/auth');

// Stops someone flooding a chat (30 new messages per minute)
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'You are sending messages too fast. Please wait a moment.' }
});

router.use(protect); // everything below requires login

router.post('/', restrictTo('customer', 'admin'), createOrder);
router.get('/my-orders', getMyOrders);
router.get('/shop-orders', restrictTo('shop_owner', 'admin'), getShopOrders);
router.get('/unread', getUnread);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendLimiter, sendMessage);
router.get('/:id', getOrderById);
router.put('/:id/status', restrictTo('shop_owner', 'admin'), updateOrderStatus);
router.put('/:id/cancel', cancelOrder);

module.exports = router;
