const mongoose = require('mongoose');

// One chat message. Every message belongs to one order, so the customer and the shop
// talk about that specific gift.
const messageSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  // the logged-in user who wrote it (empty for the automatic assistant)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 'customer', 'shop', or 'assistant' (the automatic Hadiya Assistant) - stored so the chat can
  // label messages without extra lookups
  senderRole: {
    type: String,
    enum: ['customer', 'shop', 'assistant'],
    required: true
  },
  senderName: { type: String, trim: true },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: true
});

messageSchema.index({ order: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
