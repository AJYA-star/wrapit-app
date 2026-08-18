const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  service: {
    serviceId: String,
    name: String,
    price: Number,
    description: String
  },
  giftImages: [String],
  specialInstructions: String,
  pricing: {
    servicePrice: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected'],
    default: 'pending'
  },
  pickupDetails: {
    type: { type: String, enum: ['customer_dropoff', 'shop_pickup'] },
    scheduledTime: Date,
    address: String,
    contactPhone: String
  },
  deliveryDetails: {
    type: { type: String, enum: ['customer_pickup', 'shop_delivery'] },
    scheduledTime: Date,
    address: String,
    contactPhone: String
  },
  payment: {
    method: { type: String, enum: ['cash', 'card', 'wallet'], required: true },
    status: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    transactionId: String,
    paidAt: Date
  },
  timeline: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String
  }],
  cancellation: {
    cancelledBy: { type: String, enum: ['customer', 'shop', 'admin'] },
    reason: String,
    cancelledAt: Date
  }
}, {
  timestamps: true
});

// Generate order number before saving
// Generate order number before saving (Modern Async Version)
orderSchema.pre('save', async function() {
  if (!this.orderNumber) {
    this.orderNumber = `WRP${Date.now()}`;
  }
});

module.exports = mongoose.model('Order', orderSchema);
