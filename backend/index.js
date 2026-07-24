const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Tag = require('./Tag');

const app = express();
app.use(express.json());
app.use(cors());

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// ==========================================
// MONGOOSE SCHEMAS & MODELS
// ==========================================

// Tag Schema
const tagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  color: { type: String, default: '#3B82F6' }, // Hex color code
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Tag = mongoose.model('Tag', tagSchema);

// User Schema (Updated with Tags)
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['Member', 'Board', 'Admin'], 
    default: 'Member' 
  },
  inscriptionNumber: { type: String },
  dateOfBirth: { type: Date },
  pushToken: { type: String },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ==========================================
// MIDDLEWARES
// ==========================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

const requireAdminOrBoard = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || (user.role !== 'Admin' && user.role !== 'Board')) {
      return res.status(403).json({ message: 'Permission denied. Admin or Board role required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server authorization error', error: error.message });
  }
};

// ==========================================
// TAG SYSTEM API ROUTES
// ==========================================

// 1. Get all tags
app.get('/api/tags', authenticateToken, async (req, res) => {
  try {
    const tags = await Tag.find().sort({ name: 1 });
    res.json(tags);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch tags', error: error.message });
  }
});

// 2. Create a new tag (Admin / Board only)
app.post('/api/tags', authenticateToken, requireAdminOrBoard, async (req, res) => {
  try {
    const { name, color, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Tag name is required' });
    }

    const existingTag = await Tag.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingTag) {
      return res.status(400).json({ message: 'Tag with this name already exists' });
    }

    const newTag = new Tag({ name, color, description });
    await newTag.save();

    res.status(201).json(newTag);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create tag', error: error.message });
  }
});

// 3. Update a tag (Admin / Board only)
app.put('/api/tags/:id', authenticateToken, requireAdminOrBoard, async (req, res) => {
  try {
    const { name, color, description } = req.body;
    const updatedTag = await Tag.findByIdAndUpdate(
      req.params.id,
      { name, color, description },
      { new: true, runValidators: true }
    );

    if (!updatedTag) {
      return res.status(404).json({ message: 'Tag not found' });
    }

    res.json(updatedTag);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update tag', error: error.message });
  }
});

// 4. Delete a tag and remove references from users
app.delete('/api/tags/:id', authenticateToken, requireAdminOrBoard, async (req, res) => {
  try {
    const tagId = req.params.id;
    const deletedTag = await Tag.findByIdAndDelete(tagId);

    if (!deletedTag) {
      return res.status(404).json({ message: 'Tag not found' });
    }

    // Pull deleted tag ID from all users who had it assigned
    await User.updateMany(
      { tags: tagId },
      { $pull: { tags: tagId } }
    );

    res.json({ message: 'Tag deleted successfully and unassigned from all users' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete tag', error: error.message });
  }
});

// ==========================================
// USER TAG ASSIGNMENT ROUTES
// ==========================================

// 5. Assign tags to a user (Admin / Board only)
app.post('/api/users/:userId/tags', authenticateToken, requireAdminOrBoard, async (req, res) => {
  try {
    const { tagIds } = req.body; // Array of Tag ObjectIds

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ message: 'tagIds must be an array' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $addToSet: { tags: { $each: tagIds } } }, // Prevents duplicates
      { new: true }
    ).populate('tags');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Tags assigned successfully', tags: user.tags });
  } catch (error) {
    res.status(500).json({ message: 'Failed to assign tags', error: error.message });
  }
});

// 6. Remove a tag from a user (Admin / Board only)
app.delete('/api/users/:userId/tags/:tagId', authenticateToken, requireAdminOrBoard, async (req, res) => {
  try {
    const { userId, tagId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { tags: tagId } },
      { new: true }
    ).populate('tags');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Tag removed from user', tags: user.tags });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove tag from user', error: error.message });
  }
});

// 7. Get user profile with populated tags
app.get('/api/users/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password').populate('tags');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user profile', error: error.message });
  }
});

// ==========================================
// SERVER INITIALIZATION
// ==========================================

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/robotech';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error('MongoDB connection error:', err));