const express = require('express');
const router = express.Router();
const {
  createShop,
  getAllShops,
  getMyShop,
  getShopById,
  updateShop,
  verifyShop,
  deleteShop,
  addService,
  updateService,
  deleteService
} = require('../controllers/shopcontroller');
const { protect, restrictTo } = require('../middleware/auth');

// Public routes
router.get('/', getAllShops);

// Owner routes - must come BEFORE '/:id' so "mine" is not treated as an id
router.get('/mine', protect, restrictTo('shop_owner', 'admin'), getMyShop);
router.post('/', protect, restrictTo('shop_owner', 'admin'), createShop);

router.get('/:id', getShopById);
router.put('/:id', protect, updateShop);
router.put('/:id/verify', protect, restrictTo('admin'), verifyShop);
router.delete('/:id', protect, deleteShop);

// Service routes
router.post('/:id/services', protect, addService);
router.put('/:shopId/services/:serviceId', protect, updateService);
router.delete('/:shopId/services/:serviceId', protect, deleteService);

module.exports = router;
