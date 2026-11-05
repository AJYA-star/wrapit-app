const mongoose = require('mongoose');

// One review per completed order. The shop's star average is recalculated by
// controllers/reviewcontroller.js every time a review is added.
const reviewSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true // one review per order
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Review', reviewSchema);
