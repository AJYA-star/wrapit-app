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
const { protect } = require('../middleware/auth');

router.use(protect); // This protects all routes below

router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/shop-orders', getShopOrders);
router.get('/:id', getOrderById);
router.put('/:id/status', updateOrderStatus);
router.put('/:id/cancel', cancelOrder);

module.exports = router;
