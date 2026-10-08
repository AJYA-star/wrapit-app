const Shop = require('../models/shop');

// Fields an owner is allowed to set/change themselves.
// Things like isVerified, commission, rating, totalOrders and owner are NOT in this list.
const OWNER_EDITABLE = [
  'name', 'description', 'logo', 'images', 'phone', 'email',
  'address', 'workingHours', 'bankDetails', 'isActive'
];
const SERVICE_EDITABLE = ['name', 'description', 'price', 'duration', 'image', 'isAvailable'];

const pick = (obj, keys) =>
  keys.reduce((acc, key) => {
    if (obj && obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isOwnerOrAdmin = (shop, user) =>
  shop.owner.toString() === user.id.toString() || user.role === 'admin';

// New shops are visible straight away unless you set AUTO_VERIFY_SHOPS=false
// (then an admin must call PUT /api/shops/:id/verify).
const autoVerify = () => process.env.AUTO_VERIFY_SHOPS !== 'false';

exports.createShop = async (req, res, next) => {
  try {
    const existing = await Shop.findOne({ owner: req.user.id });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You already have a shop'
      });
    }

    const shop = await Shop.create({
      ...pick(req.body, OWNER_EDITABLE),
      services: Array.isArray(req.body.services)
        ? req.body.services.map(s => pick(s, SERVICE_EDITABLE))
        : [],
      owner: req.user.id,
      isVerified: autoVerify()
    });

    res.status(201).json({
      success: true,
      message: 'Shop created successfully',
      shop
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyShop = async (req, res, next) => {
  try {
    const shop = await Shop.findOne({ owner: req.user.id });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'You do not have a shop yet'
      });
    }
    res.status(200).json({ success: true, shop });
  } catch (error) {
    next(error);
  }
};

exports.getAllShops = async (req, res, next) => {
  try {
    const { city, search, minRating } = req.query;
    const query = { isActive: true, isVerified: true };

    if (city) query['address.city'] = new RegExp(escapeRegex(city), 'i');
    if (search) query.name = new RegExp(escapeRegex(search), 'i');
    if (minRating && !Number.isNaN(Number(minRating))) {
      query['rating.average'] = { $gte: Number(minRating) };
    }

    const shops = await Shop.find(query)
      .select('-bankDetails -commission')
      .populate('owner', 'name')
      .sort({ 'rating.average': -1 });

    res.status(200).json({
      success: true,
      count: shops.length,
      shops
    });
  } catch (error) {
    next(error);
  }
};

exports.getShopById = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id)
      .select('-bankDetails -commission')
      .populate('owner', 'name avatar');

    if (!shop || !shop.isActive || !shop.isVerified) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    res.status(200).json({
      success: true,
      shop
    });
  } catch (error) {
    next(error);
  }
};

exports.updateShop = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    if (!isOwnerOrAdmin(shop, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Owners can only touch their own fields; admins may also change commission / verification
    const allowed = req.user.role === 'admin'
      ? [...OWNER_EDITABLE, 'commission', 'isVerified']
      : OWNER_EDITABLE;

    shop.set(pick(req.body, allowed));
    await shop.save();

    res.status(200).json({
      success: true,
      message: 'Shop updated successfully',
      shop
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyShop = async (req, res, next) => {
  try {
    const shop = await Shop.findByIdAndUpdate(
      req.params.id,
      { isVerified: req.body.isVerified !== false },
      { new: true }
    );
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    res.status(200).json({ success: true, shop });
  } catch (error) {
    next(error);
  }
};

exports.deleteShop = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    if (!isOwnerOrAdmin(shop, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await Shop.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Shop deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.addService = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    if (!isOwnerOrAdmin(shop, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    shop.services.push(pick(req.body, SERVICE_EDITABLE));
    await shop.save();
    res.status(201).json({
      success: true,
      message: 'Service added successfully',
      shop
    });
  } catch (error) {
    next(error);
  }
};

exports.updateService = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    if (!isOwnerOrAdmin(shop, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const service = shop.services.id(req.params.serviceId);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    Object.assign(service, pick(req.body, SERVICE_EDITABLE));
    await shop.save();
    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      shop
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteService = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    if (!isOwnerOrAdmin(shop, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const service = shop.services.id(req.params.serviceId);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    service.deleteOne();
    await shop.save();
    res.status(200).json({
      success: true,
      message: 'Service deleted successfully',
      shop
    });
  } catch (error) {
    next(error);
  }
};
