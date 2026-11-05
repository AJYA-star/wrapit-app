const express = require('express');
const router = express.Router();
const { getKey, subscribe, unsubscribe } = require('../controllers/pushcontroller');
const { protect } = require('../middleware/auth');

router.get('/key', getKey);
router.post('/subscribe', protect, subscribe);
router.post('/unsubscribe', protect, unsubscribe);

module.exports = router;
