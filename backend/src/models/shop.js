const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please provide shop name'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Please provide shop description']
  },
  logo: {
    type: String,
    default: 'default-shop.png'
  },
  images: [String],
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },

  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: String,
    zipCode: String,
    country: { type: String, default: 'UAE' }
    // We removed the location section from here
  },

  services: [{
    name: { type: String, required: true }, // e.g., "Basic Wrapping", "Premium Wrapping"
    description: String,
    price: { type: Number, required: true },
    duration: Number, // in minutes
    image: String,
    isAvailable: { type: Boolean, default: true }
  }],
  workingHours: {
    monday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
    tuesday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
    wednesday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
    thursday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
    friday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
    saturday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
    sunday: { open: String, close: String, isClosed: { type: Boolean, default: false } }
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  commission: {
    type: Number,
    default: 20 // 20% commission
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  bankDetails: {
    bankName: String,
    accountName: String,
    accountNumber: String,
    iban: String
  }
}, {
  timestamps: true
});


module.exports = mongoose.model('Shop', shopSchema);

