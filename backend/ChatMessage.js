const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: String,
  senderAvatar: String,
  senderTags: Array,
  text: { type: String, required: true }, // Must be type String
}, { timestamps: true });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);