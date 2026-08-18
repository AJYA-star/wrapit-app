const express = require('express');
const router = express.Router();
const {
  createShop,
  getAllShops,
  getShopById,
  updateShop,
  deleteShop,
  addService,
  updateService,
  deleteService
} = require('../controllers/shopcontroller');
const { protect } = require('../middleware/auth');

// Public routes
router.get('/', getAllShops);
router.get('/:id', getShopById);

// Protected routes
router.post('/', createShop);
router.put('/:id', protect, updateShop);
router.delete('/:id', protect, deleteShop);

// Service routes
router.post('/:id/services', protect, addService);
router.put('/:shopId/services/:serviceId', protect, updateService);
router.delete('/:shopId/services/:serviceId', protect, deleteService);

module.exports = router;
