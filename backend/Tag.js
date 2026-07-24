const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  color: { type: String, default: '#3B82F6' },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
  isPublic: { type: Boolean, default: false },
});

module.exports = mongoose.model('Tag', tagSchema);