const mongoose = require('mongoose');
const Order = require('../models/order');
const Shop = require('../models/shop');

// Which status can follow which. The shop owner can only follow this map.
const TRANSITIONS = {
  pending: ['accepted', 'rejected'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed'],
  out_for_delivery: ['completed'],
  completed: [],
  cancelled: [],
  rejected: []
};

const PICKUP_TYPES = ['customer_dropoff', 'shop_pickup'];
const DELIVERY_TYPES = ['customer_pickup', 'shop_delivery'];

// Until online payments are connected only cash is accepted.
const ACCEPTED_PAYMENT_METHODS = ['cash'];

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

const text = (value, max = 300) =>
  typeof value === 'string' ? value.trim().slice(0, max) : undefined;

const parseDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Delivery fee per leg (pickup leg + return leg) that the shop handles. Set DELIVERY_FEE_PER_LEG in .env (AED).
const deliveryFeePerLeg = () => {
  const fee = Number(process.env.DELIVERY_FEE_PER_LEG);
  return Number.isFinite(fee) && fee >= 0 ? fee : 0;
};

exports.createOrder = async (req, res, next) => {
  try {
    const { shopId, serviceId, specialInstructions, pickupDetails = {}, deliveryDetails = {}, payment = {} } = req.body;

    if (!mongoose.isValidObjectId(shopId)) return fail(res, 400, 'A valid shop is required');
    if (!serviceId) return fail(res, 400, 'Please choose a service');

    const shop = await Shop.findById(shopId);
    if (!shop || !shop.isActive || !shop.isVerified) return fail(res, 404, 'Shop not found');
    if (shop.owner.toString() === req.user.id.toString()) {
      return fail(res, 400, 'You cannot order from your own shop');
    }

    // Price always comes from the database, never from the browser
    const service = shop.services.id(serviceId);
    if (!service) return fail(res, 404, 'Service not found');
    if (service.isAvailable === false) return fail(res, 400, 'This service is currently unavailable');

    if (!PICKUP_TYPES.includes(pickupDetails.type)) {
      return fail(res, 400, 'Please choose how the gift gets to the shop');
    }
    if (!DELIVERY_TYPES.includes(deliveryDetails.type)) {
      return fail(res, 400, 'Please choose how you get the gift back');
    }
    if (pickupDetails.type === 'shop_pickup' && !text(pickupDetails.address)) {
      return fail(res, 400, 'A pickup address is required');
    }
    if (deliveryDetails.type === 'shop_delivery' && !text(deliveryDetails.address)) {
      return fail(res, 400, 'A delivery address is required');
    }

    const method = payment.method || 'cash';
    if (!ACCEPTED_PAYMENT_METHODS.includes(method)) {
      return fail(res, 400, 'Only cash payment is available right now');
    }

    const pickupTime = parseDate(pickupDetails.scheduledTime);
    const deliveryTime = parseDate(deliveryDetails.scheduledTime);
    if (pickupTime === null || deliveryTime === null) return fail(res, 400, 'Invalid date/time');

    const legs =
      (pickupDetails.type === 'shop_pickup' ? 1 : 0) +
      (deliveryDetails.type === 'shop_delivery' ? 1 : 0);
    const servicePrice = service.price;
    const deliveryFee = legs * deliveryFeePerLeg();

    const order = await Order.create({
      customer: req.user.id,
      shop: shop._id,
      service: {
        serviceId: service._id.toString(),
        name: service.name,
        price: service.price,
        description: service.description
      },
      specialInstructions: text(specialInstructions, 500),
      pricing: {
        servicePrice,
        deliveryFee,
        discount: 0,
        total: servicePrice + deliveryFee
      },
      pickupDetails: {
        type: pickupDetails.type,
        address: text(pickupDetails.address),
        contactPhone: text(pickupDetails.contactPhone, 30) || req.user.phone,
        scheduledTime: pickupTime
      },
      deliveryDetails: {
        type: deliveryDetails.type,
        address: text(deliveryDetails.address),
        contactPhone: text(deliveryDetails.contactPhone, 30) || req.user.phone,
        scheduledTime: deliveryTime
      },
      payment: { method },
      status: 'pending',
      timeline: [{ status: 'pending', note: 'Order placed' }]
    });

    res.status(201).json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ customer: req.user.id })
      .populate('shop', 'name phone')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    next(error);
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'Order not found');

    const order = await Order.findById(req.params.id)
      .populate('customer', 'name phone')
      .populate('shop', 'name phone address owner');

    if (!order) return fail(res, 404, 'Order not found');

    const isCustomer = order.customer._id.toString() === req.user.id.toString();
    const isShopOwner = order.shop && order.shop.owner.toString() === req.user.id.toString();
    if (!isCustomer && !isShopOwner && req.user.role !== 'admin') {
      return fail(res, 403, 'Not authorized to view this order');
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'Order not found');

    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 404, 'Order not found');

    const shop = await Shop.findById(order.shop);
    const isShopOwner = shop && shop.owner.toString() === req.user.id.toString();
    if (!isShopOwner && req.user.role !== 'admin') {
      return fail(res, 403, 'Not authorized to update this order');
    }

    const newStatus = req.body.status;
    if (!Order.STATUSES.includes(newStatus)) return fail(res, 400, 'Invalid status');

    const allowed = TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      return fail(
        res,
        400,
        `An order that is "${order.status}" cannot be changed to "${newStatus}"` +
          (allowed.length ? `. Allowed next steps: ${allowed.join(', ')}` : '')
      );
    }

    const note = text(req.body.note, 200);

    order.status = newStatus;
    order.timeline.push({ status: newStatus, note });

    if (newStatus === 'cancelled' || newStatus === 'rejected') {
      order.cancellation = {
        cancelledBy: isShopOwner ? 'shop' : 'admin',
        reason: text(req.body.reason, 200) || note,
        cancelledAt: new Date()
      };
    }

    if (newStatus === 'completed') {
      if (order.payment.method === 'cash') {
        order.payment.status = 'paid';
        order.payment.paidAt = new Date();
      }
      await Shop.findByIdAndUpdate(order.shop, { $inc: { totalOrders: 1 } });
    }

    await order.save();

    res.status(200).json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

exports.getShopOrders = async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ owner: req.user.id });
    if (!shop) return fail(res, 404, 'Shop not found');

    const filter = { shop: shop._id };
    if (req.query.status && Order.STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const orders = await Order.find(filter)
      .populate('customer', 'name phone')
      .populate('shop', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    next(error);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'Order not found');

    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 404, 'Order not found');

    if (order.customer.toString() !== req.user.id.toString()) {
      return fail(res, 403, 'Not authorized to cancel this order');
    }

    if (order.status !== 'pending') {
      return fail(res, 400, 'Only pending orders can be cancelled');
    }

    order.status = 'cancelled';
    order.cancellation = {
      cancelledBy: 'customer',
      reason: text(req.body && req.body.reason, 200),
      cancelledAt: new Date()
    };
    order.timeline.push({ status: 'cancelled', note: 'Cancelled by customer' });
    await order.save();

    res.status(200).json({ success: true, order });
  } catch (error) {
    next(error);
  }
};
