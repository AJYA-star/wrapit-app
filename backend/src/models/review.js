const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true // One review per order
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
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    trim: true
  },
  images: [String],
  response: {
    text: String,
    respondedAt: Date
  }
}, {
  timestamps: true
});

// Update shop rating after review is saved
reviewSchema.post('save', async function() {
  const Shop = mongoose.model('Shop');
  const Review = mongoose.model('Review');
  
  const stats = await Review.aggregate([
    { $match: { shop: this.shop } },
    {
      $group: {
        _id: '$shop',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    await Shop.findByIdAndUpdate(this.shop, {
      'rating.average': stats[0].averageRating.toFixed(1),
      'rating.count': stats[0].reviewCount
    });
  }
});

module.exports = mongoose.model('Review', reviewSchema);
