const mongoose = require('mongoose');
const Order = require('../models/order');
const Shop = require('../models/shop');
const Review = require('../models/review');

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Recalculates the shop's average stars and review count from all its reviews
async function updateShopRating(shopId) {
  const stats = await Review.aggregate([
    { $match: { shop: new mongoose.Types.ObjectId(String(shopId)) } },
    { $group: { _id: '$shop', average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const average = stats.length ? Math.round(stats[0].average * 10) / 10 : 0;
  const count = stats.length ? stats[0].count : 0;
  await Shop.findByIdAndUpdate(shopId, { 'rating.average': average, 'rating.count': count });
  return { average, count };
}

// POST /api/orders/:id/review   { rating: 1-5, comment?: text }
exports.createReview = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'Order not found');

    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 404, 'Order not found');

    if (order.customer.toString() !== req.user.id.toString()) {
      return fail(res, 403, 'You can only review your own orders');
    }
    if (order.status !== 'completed') {
      return fail(res, 400, 'You can review an order once it is completed');
    }

    const rating = Number(req.body && req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return fail(res, 400, 'Please choose a rating from 1 to 5 stars');
    }

    let comment = req.body && req.body.comment;
    comment = typeof comment === 'string' ? comment.trim() : '';
    if (comment.length > 500) return fail(res, 400, 'Your comment is too long (max 500 characters)');

    if (await Review.findOne({ order: order._id })) {
      return fail(res, 400, 'You already reviewed this order');
    }

    let review;
    try {
      review = await Review.create({
        order: order._id,
        customer: req.user.id,
        shop: order.shop,
        rating,
        comment
      });
    } catch (err) {
      // two quick taps: the unique index on "order" stops the second one
      if (err && err.code === 11000) return fail(res, 400, 'You already reviewed this order');
      throw err;
    }

    const shopRating = await updateShopRating(order.shop);
    res.status(201).json({
      success: true,
      message: 'Thank you for your review',
      review: { rating: review.rating, comment: review.comment, createdAt: review.createdAt },
      shopRating
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/shops/:id/reviews   (public) - newest 30, reviewer shown by first name only
exports.getShopReviews = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'Shop not found');

    const shop = await Shop.findById(req.params.id).select('isActive isVerified rating');
    if (!shop || !shop.isActive || !shop.isVerified) return fail(res, 404, 'Shop not found');

    const reviews = await Review.find({ shop: shop._id })
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(30);

    res.status(200).json({
      success: true,
      rating: { average: (shop.rating && shop.rating.average) || 0, count: (shop.rating && shop.rating.count) || 0 },
      reviews: reviews.map((r) => ({
        rating: r.rating,
        comment: r.comment || '',
        createdAt: r.createdAt,
        name: String((r.customer && r.customer.name) || 'Customer').trim().split(/\s+/)[0]
      }))
    });
  } catch (error) {
    next(error);
  }
};
