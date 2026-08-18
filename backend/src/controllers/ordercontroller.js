const Order = require('../models/order');
const Shop = require('../models/shop');

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
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Security Check: Verify this shop owner owns the shop attached to the order
    const shop = await Shop.findOne({ owner: req.user.id });
    if (!shop || order.shop.toString() !== shop._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this order' });
    }

    // Update and save
    order.status = req.body.status;
    await order.save();

    res.status(200).json({ success: true, order });
  } catch (error) { 
    next(error); 
  }
};