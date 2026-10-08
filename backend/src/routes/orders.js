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
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect); // everything below requires login

router.post('/', restrictTo('customer', 'admin'), createOrder);
router.get('/my-orders', getMyOrders);
router.get('/shop-orders', restrictTo('shop_owner', 'admin'), getShopOrders);
router.get('/:id', getOrderById);
router.put('/:id/status', restrictTo('shop_owner', 'admin'), updateOrderStatus);
router.put('/:id/cancel', cancelOrder);

module.exports = router;
