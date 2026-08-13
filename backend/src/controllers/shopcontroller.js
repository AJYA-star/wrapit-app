const Shop = require('../models/Shop');

exports.createShop = async (req, res, next) => {
  try {
    
    const shop = await Shop.create(req.body);
    res.status(201).json({ 
      success: true, 
      message: 'Shop created successfully', 
      shop 
    });
  } catch (error) { 
    next(error); 
  }
};

exports.getAllShops = async (req, res, next) => {
  try {
    const { city, search, minRating } = req.query;
    let query = { isActive: true, isVerified: true };
    if (city) query['address.city'] = new RegExp(city, 'i');
    if (search) query.name = new RegExp(search, 'i');
    if (minRating) query['rating.average'] = { $gte: minRating };
    const shops = await Shop.find(query)
      .populate('owner', 'name email phone')
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
      .populate('owner', 'name email phone avatar');
    if (!shop) {
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
      return res.status(404).json({ 
        success: false, 
        message: 'Shop not found' 
      });
    }
    if (shop.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }
    const updated = await Shop.findByIdAndUpdate(req.params.id, req.body, { 
      new: true,
      runValidators: true
    });
    res.status(200).json({ 
      success: true, 
      message: 'Shop updated successfully', 
      shop: updated 
    });
  } catch (error) { 
    next(error); 
  }
};

exports.deleteShop = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ 
        success: false, 
        message: 'Shop not found' 
      });
    }
    if (shop.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }
    await Shop.findByIdAndDelete(req.params.id);
    res.status(200).json({ 
      success: true, 
      message: 'Shop deleted successfully' 
    });
  } catch (error) { 
    next(error); 
  }
};
exports.addService = async (req, res, next) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ 
        success: false, 
        message: 'Shop not found' 
      });
    }
    if (shop.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }
    shop.services.push(req.body);
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
      return res.status(404).json({ 
        success: false, 
        message: 'Shop not found' 
      });
    }
    if (shop.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }
    const service = shop.services.id(req.params.serviceId);
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        message: 'Service not found' 
      });
    }
    Object.assign(service, req.body);
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
      return res.status(404).json({ 
        success: false, 
        message: 'Shop not found' 
      });
    }
    if (shop.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }
    shop.services.id(req.params.serviceId).deleteOne();
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
