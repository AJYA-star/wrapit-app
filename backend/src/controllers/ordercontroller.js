const mongoose = require('mongoose');
const Order = require('../models/order');
const Shop = require('../models/shop');
const Review = require('../models/review');
const { notifyUser } = require('../services/notify');

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

const round2 = (n) => Math.round(n * 100) / 100;

// A shop's commission rate in percent (20 unless the admin set something else)
const rateOf = (shop) => {
  const r = shop && Number(shop.commission);
  return Number.isFinite(r) && r >= 0 && r <= 100 ? r : 20;
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
    const MIN_ADDRESS = 8;
    if (pickupDetails.type === 'shop_pickup' && (text(pickupDetails.address) || '').length < MIN_ADDRESS) {
      return fail(res, 400, 'Please enter the full pickup address (building, street, area)');
    }
    if (deliveryDetails.type === 'shop_delivery' && (text(deliveryDetails.address) || '').length < MIN_ADDRESS) {
      return fail(res, 400, 'Please enter the full delivery address (building, street, area)');
    }
    const phoneDigits = (value) => String(value || '').replace(/\D/g, '').length;
    const contact = text(pickupDetails.contactPhone, 30) || req.user.phone;
    if (phoneDigits(contact) < 7) {
      return fail(res, 400, 'Please enter a valid contact phone number');
    }

    const method = payment.method || 'cash';
    if (!ACCEPTED_PAYMENT_METHODS.includes(method)) {
      return fail(res, 400, 'Only cash payment is available right now');
    }

    const pickupTime = parseDate(pickupDetails.scheduledTime);
    const deliveryTime = parseDate(deliveryDetails.scheduledTime);
    if (pickupTime === null || deliveryTime === null) return fail(res, 400, 'Invalid date/time');
    if (!pickupTime) return fail(res, 400, 'Please choose a date and time');
    // Allow a small margin so a time picked a moment ago is still accepted
    if (pickupTime.getTime() < Date.now() - 5 * 60 * 1000) {
      return fail(res, 400, 'The date and time must be in the future');
    }

    const legs =
      (pickupDetails.type === 'shop_pickup' ? 1 : 0) +
      (deliveryDetails.type === 'shop_delivery' ? 1 : 0);
    const servicePrice = service.price;
    const deliveryFee = legs * deliveryFeePerLeg();
    const total = servicePrice + deliveryFee;
    // Hadiya's commission is a percentage of the service price (not of the delivery fee)
    const commissionRate = rateOf(shop);
    const commission = round2(servicePrice * commissionRate / 100);

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
        total,
        commissionRate,
        commission,
        shopEarnings: round2(total - commission)
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

    // phone alert for the shop owner (after answering the customer; never blocks the order)
    notifyUser(shop.owner, 'new_order', { orderId: order._id, service: service.name, total: order.pricing.total });
  } catch (error) {
    next(error);
  }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ customer: req.user.id })
      .populate('shop', 'name nameAr')
      .sort({ createdAt: -1 });

    // attach the customer's own review (if any) so the page can show it instead of the "Rate" button
    const reviews = await Review.find({ order: { $in: orders.map((o) => o._id) } });
    const byOrder = {};
    reviews.forEach((r) => { byOrder[r.order.toString()] = { rating: r.rating, comment: r.comment || '' }; });
    const list = orders.map((o) => Object.assign(o.toObject(), { review: byOrder[o._id.toString()] || null }));

    res.status(200).json({ success: true, orders: list });
  } catch (error) {
    next(error);
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'Order not found');

    const order = await Order.findById(req.params.id)
      .populate('customer', 'name phone')
      .populate('shop', 'name nameAr address owner');

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

    // phone alert for the customer
    notifyUser(order.customer, 'order_status', { orderId: order._id, status: newStatus });
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
      .populate('shop', 'name nameAr')
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

    // phone alert for the shop owner
    const shop = await Shop.findById(order.shop).select('owner');
    if (shop) notifyUser(shop.owner, 'order_cancelled_by_customer', { orderId: order._id, service: order.service && order.service.name });
  } catch (error) {
    next(error);
  }
};

// ---- Admin only: how many orders, how much was sold, how much commission Hadiya earned and is owed ----

// First moment of the current month in UAE time (UTC+4), used for the "this month" view
const startOfThisMonthUAE = () => {
  const dubai = new Date(Date.now() + 4 * 3600 * 1000);
  return new Date(Date.UTC(dubai.getUTCFullYear(), dubai.getUTCMonth(), 1) - 4 * 3600 * 1000);
};

exports.adminSummary = async (req, res, next) => {
  try {
    const period = req.query.period === 'month' ? 'month' : 'all';
    const since = period === 'month' ? startOfThisMonthUAE() : null;

    const orders = await Order.find().select('shop status pricing commissionPaid createdAt').lean();
    const shopIds = [...new Set(orders.map((o) => String(o.shop)))];
    const shops = await Shop.find({ _id: { $in: shopIds } }).select('name nameAr commission').lean();
    const shopById = {};
    shops.forEach((s) => { shopById[String(s._id)] = s; });

    // Orders placed before commission was recorded get it worked out from the shop's rate
    const commissionOf = (o) => {
      const p = o.pricing || {};
      if (Number.isFinite(p.commission)) return p.commission;
      return round2((p.servicePrice || 0) * rateOf(shopById[String(o.shop)]) / 100);
    };

    const byStatus = {};
    const rows = {};
    const totals = { orders: 0, completed: 0, sales: 0, commission: 0, owed: 0 };

    orders.forEach((o) => {
      const id = String(o.shop);
      const shop = shopById[id] || {};
      const row = rows[id] || (rows[id] = {
        shopId: id, name: shop.name || 'Deleted shop', nameAr: shop.nameAr || '',
        rate: rateOf(shop), orders: 0, completed: 0, sales: 0, commission: 0, owed: 0
      });
      const done = o.status === 'completed';
      const inPeriod = !since || new Date(o.createdAt) >= since;

      if (inPeriod) {
        byStatus[o.status] = (byStatus[o.status] || 0) + 1;
        row.orders += 1; totals.orders += 1;
        if (done) {
          const c = commissionOf(o);
          row.completed += 1; totals.completed += 1;
          row.sales += (o.pricing && o.pricing.total) || 0; totals.sales += (o.pricing && o.pricing.total) || 0;
          row.commission += c; totals.commission += c;
        }
      }
      // what the shop still owes is always counted over all time, so nothing is forgotten
      if (done && !o.commissionPaid) { const c = commissionOf(o); row.owed += c; totals.owed += c; }
    });

    const list = Object.values(rows).map((r) => Object.assign(r, {
      sales: round2(r.sales), commission: round2(r.commission), owed: round2(r.owed)
    })).sort((a, b) => b.owed - a.owed || b.sales - a.sales);
    ['sales', 'commission', 'owed'].forEach((k) => { totals[k] = round2(totals[k]); });

    res.status(200).json({ success: true, period, totals, byStatus, shops: list });
  } catch (error) {
    next(error);
  }
};

// The admin received a shop's commission: mark all of that shop's completed, unpaid orders as settled
exports.settleShop = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.shopId)) return fail(res, 404, 'Shop not found');
    const result = await Order.updateMany(
      { shop: req.params.shopId, status: 'completed', commissionPaid: { $ne: true } },
      { $set: { commissionPaid: true, commissionPaidAt: new Date() } }
    );
    res.status(200).json({ success: true, settled: result.modifiedCount !== undefined ? result.modifiedCount : result.nModified || 0 });
  } catch (error) {
    next(error);
  }
};
