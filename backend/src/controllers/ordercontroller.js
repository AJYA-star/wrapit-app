const Order = require('../models/Order');
const Shop = require('../models/Shop');

exports.createOrder = async (req, res, next) => {
  try {
    const order = await Order.create({
      customer: req.user.id,
      shop: req.body.shopId,
      service: req.body.service,
      pricing: req.body.pricing,
      status: 'pending'
    });
    res.status(201).json({ success: true, order });
  } catch (error) { next(error); }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ customer: req.user.id }).populate('shop', 'name');
    res.status(200).json({ success: true, orders });
  } catch (error) { next(error); }
};

exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer shop');
    res.status(200).json({ success: true, order });
  } catch (error) { next(error); }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.status(200).json({ success: true, order });
  } catch (error) { next(error); }
};

exports.getShopOrders = async (req, res, next) => {
  try {
    const orders = await Order.find().populate('customer', 'name email').sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (error) { next(error); }
};

// Add this placeholder for cancelOrder so the route doesn't crash
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: 'cancelled' }, { new: true });
    res.status(200).json({ success: true, order });
  } catch (error) { next(error); }
};
