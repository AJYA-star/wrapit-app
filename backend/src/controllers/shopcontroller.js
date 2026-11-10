const Shop = require('../models/shop');

// Fields an owner is allowed to set/change themselves.
// Things like isVerified, commission, rating, totalOrders and owner are NOT in this list.
const OWNER_EDITABLE = [
  'name', 'description', 'descriptionAr', 'logo', 'images', 'email',
  'address', 'workingHours', 'bankDetails', 'isActive', 'aiReplies'
];
const SERVICE_EDITABLE = ['name', 'nameAr', 'description', 'descriptionAr', 'price', 'duration', 'image', 'isAvailable'];

const pick = (obj, keys) =>
  keys.reduce((acc, key) => {
    if (obj && obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

// Logo and photos are stored in the database as small data-URL images (the website shrinks them
// before upload). These limits protect the database and the API.
const DATA_IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_CHARS = 150 * 1024;
const MAX_PHOTO_CHARS = 300 * 1024;
const MAX_PHOTOS = 4;

const imageProblem = (body) => {
  if (body.logo !== undefined && body.logo !== '' && body.logo !== 'default-shop.png') {
    if (typeof body.logo !== 'string' || !DATA_IMG.test(body.logo)) return 'The logo must be a JPG, PNG or WebP image';
    if (body.logo.length > MAX_LOGO_CHARS) return 'The logo image is too large. Please choose a smaller one';
  }
  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) return 'Photos must be a list';
    if (body.images.length > MAX_PHOTOS) return 'You can add up to ' + MAX_PHOTOS + ' photos';
    for (const img of body.images) {
      if (typeof img !== 'string') return 'Each photo must be an image';
      const ok = DATA_IMG.test(img) || /^https?:\/\/\S{1,500}$/i.test(img);
      if (!ok) return 'Photos must be JPG, PNG or WebP images';
      if (img.length > MAX_PHOTO_CHARS) return 'A photo is too large. Please choose a smaller one';
    }
  }
  return null;
};

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
      .select('-bankDetails -commission -phone')
      .populate('owner', 'name')
      .sort({ 'rating.average': -1 });

    // the list only needs the first photo (keeps the page fast); the shop page loads them all
    const list = shops.map((s) => {
      const o = s.toObject();
      o.images = (o.images || []).slice(0, 1);
      return o;
    });

    res.status(200).json({
      success: true,
      count: list.length,
      shops: list
    });
  } catch (error) {
    next(error);
  }
};

exports.getShopById = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id)
      .select('-bankDetails -commission -phone')
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

    const problem = imageProblem(req.body || {});
    if (problem) return res.status(400).json({ success: false, message: problem });

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
