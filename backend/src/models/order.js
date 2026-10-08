const mongoose = require('mongoose');

const ORDER_STATUSES = [
  'pending',          // customer placed the order
  'accepted',         // shop accepted it
  'in_progress',      // shop is wrapping
  'ready',            // wrapped, waiting for pickup / delivery
  'out_for_delivery', // on its way back to the customer
  'completed',        // customer has the gift
  'cancelled',
  'rejected'
];

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
  specialInstructions: { type: String, maxlength: 500 },
  pricing: {
    servicePrice: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ORDER_STATUSES,
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

// Generate a unique order number before saving
orderSchema.pre('save', async function () {
  if (!this.orderNumber) {
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.orderNumber = `WRP${Date.now()}${random}`;
  }
});

orderSchema.statics.STATUSES = ORDER_STATUSES;

module.exports = mongoose.model('Order', orderSchema);
