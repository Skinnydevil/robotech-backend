require('dotenv').config();
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { Expo } = require('expo-server-sdk');

const Post = require('./Post');
const Conversation = require('./Conversation');
const ChatMessage = require('./ChatMessage');
const Tag = require('./Tag');

const app = express();
const server = http.createServer(app);
const expo = new Expo();

// Ensure local uploads directory exists on startup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Serve uploaded media files statically
app.use('/uploads', express.static(uploadsDir));

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Helper function to send Expo Push Notifications
const sendPushNotifications = async (tokens, title, body, data = {}) => {
  const messages = [];
  for (let pushToken of tokens) {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
      continue;
    }
    messages.push({
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
    });
  }

  const chunks = expo.chunkPushNotifications(messages);
  for (let chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }
};

// ==========================================
// DATABASE & SCHEMAS
// ==========================================
mongoose
  .connect(process.env.MONGO_URI, {
    family: 4, // Forces IPv4 resolution for MongoDB Atlas SRV lookup
  })
  .then(() => console.log('🔌 Connected securely to MongoDB Cloud Database'))
  .catch((err) => console.error('❌ Database connection failed:', err));

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    inscriptionNumber: { type: String, required: true, unique: true, sparse: true },
    dateOfBirth: { type: Date, required: false },
    role: { 
      type: String, 
      enum: ['pending', 'member', 'admin', 'board', 'Pending', 'Member', 'Admin', 'Board'], 
      default: 'pending' 
    },
    pushToken: { type: String, default: null },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
  },
  { timestamps: true }
);

const User = mongoose.model('User', UserSchema);

// Tag Settings Schema for Public Policy Control
const TagSettingsSchema = new mongoose.Schema(
  {
    allowPublicCreation: { type: Boolean, default: false },
  },
  { timestamps: true }
);
const TagSettings = mongoose.model('TagSettings', TagSettingsSchema);

// General Assembly Session Schema
const assemblySessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, default: 'General Assembly' },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    attendees: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        checkedInAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const AssemblySession = mongoose.model('AssemblySession', assemblySessionSchema);

// Middleware: Authenticate JWT Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied. Token missing.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

// Middleware: Require Admin or Board Role
const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Access denied. User identity unverified.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const userRole = user.role ? String(user.role).toLowerCase() : '';
    if (userRole !== 'admin' && userRole !== 'board') {
      return res.status(403).json({ error: 'Access denied. Admin or Board privileges required.' });
    }

    req.currentUser = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server authorization error: ' + error.message });
  }
};

// Save / Update Push Token Route
app.put('/api/users/push-token', authenticateToken, async (req, res) => {
  try {
    const { pushToken } = req.body;
    const userId = req.user.id || req.user._id;
    await User.findByIdAndUpdate(userId, { pushToken });
    res.json({ message: 'Push token saved successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update push token' });
  }
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, inscriptionNumber, dateOfBirth } = req.body;

    if (!inscriptionNumber) {
      return res.status(400).json({ error: 'Inscription number is required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const existingInscription = await User.findOne({ inscriptionNumber: inscriptionNumber.trim() });
    if (existingInscription) {
      return res.status(400).json({ error: 'Inscription number is already in use.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      inscriptionNumber: inscriptionNumber.trim(),
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      role: 'pending',
    });

    await newUser.save();
    res.status(201).json({ message: 'Registration successful! Please wait for admin approval.' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server registration error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, pushToken } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

    if (String(user.role).toLowerCase() === 'pending') {
      return res.status(403).json({ error: 'Your account is pending admin approval.' });
    }

    if (pushToken) {
      user.pushToken = pushToken;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        inscriptionNumber: user.inscriptionNumber,
        dateOfBirth: user.dateOfBirth,
        tags: user.tags || [],
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server login error' });
  }
});

// ==========================================
// TAG SYSTEM API ROUTES
// ==========================================

app.post('/api/tags', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, color, isPublic } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const existingTag = await Tag.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (existingTag) {
      return res.status(400).json({ error: 'Tag with this name already exists' });
    }

    const newTag = new Tag({ 
      name: name.trim(), 
      color: color || '#3b82f6', 
      isPublic: isPublic ?? false 
    });
    await newTag.save();

    res.status(201).json(newTag);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create tag', details: error.message });
  }
});

app.get('/api/tags', authenticateToken, async (req, res) => {
  try {
    let query = {};
    const userRole = req.user.role ? String(req.user.role).toLowerCase() : '';
    if (userRole !== 'admin' && userRole !== 'board') {
      query = { isPublic: true };
    }
    const tags = await Tag.find(query).sort({ name: 1 });
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tags', details: error.message });
  }
});

app.put('/api/tags/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, color, description, isPublic } = req.body;
    const updatedTag = await Tag.findByIdAndUpdate(
      req.params.id,
      { name, color, description, isPublic },
      { new: true, runValidators: true }
    );

    if (!updatedTag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json(updatedTag);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tag', details: error.message });
  }
});

app.delete('/api/tags/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tagId = req.params.id;
    const deletedTag = await Tag.findByIdAndDelete(tagId);

    if (!deletedTag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    await User.updateMany({ tags: tagId }, { $pull: { tags: tagId } });

    res.json({ message: 'Tag deleted successfully and unassigned from users' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete tag', details: error.message });
  }
});

app.post('/api/users/:userId/tags', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { tagIds } = req.body;

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'tagIds must be an array of tag IDs.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $addToSet: { tags: { $each: tagIds } } },
      { new: true }
    ).select('-password').populate('tags');

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: 'Tags assigned successfully', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign tags', details: error.message });
  }
});

app.put('/api/users/:userId/tags', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { tagIds } = req.body;

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'tagIds must be an array.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { tags: tagIds },
      { new: true }
    ).select('-password').populate('tags');

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: 'User tags updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tags', details: error.message });
  }
});

app.put('/api/users/profile/tags', authenticateToken, async (req, res) => {
  try {
    const { tagIds } = req.body;
    const userId = req.user.id || req.user._id;

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'tagIds must be an array.' });
    }

    const userRole = req.user.role ? String(req.user.role).toLowerCase() : '';
    if (userRole !== 'admin' && userRole !== 'board') {
      const publicTags = await Tag.find({ _id: { $in: tagIds }, isPublic: true });
      if (publicTags.length !== tagIds.length) {
        return res.status(403).json({ error: 'You can only select public tags.' });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { tags: tagIds },
      { new: true }
    ).select('-password').populate('tags');

    res.json({ message: 'Tags updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tags', details: error.message });
  }
});

app.delete('/api/users/:userId/tags/:tagId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, tagId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { tags: tagId } },
      { new: true }
    ).populate('tags');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Tag removed from user', tags: user.tags });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove tag from user', details: error.message });
  }
});

// ==========================================
// TAG SETTINGS API ROUTES
// ==========================================

app.get('/api/tags/settings', authenticateToken, async (req, res) => {
  try {
    let settings = await TagSettings.findOne();
    if (!settings) {
      settings = await TagSettings.create({ allowPublicCreation: false });
    }
    res.json({ allowPublicCreation: settings.allowPublicCreation });
  } catch (err) {
    console.error('Failed to fetch tag creation settings:', err);
    res.status(500).json({ error: 'Failed to fetch tag creation settings' });
  }
});

app.put('/api/tags/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { allowPublicCreation } = req.body;
    
    let settings = await TagSettings.findOne();
    if (!settings) {
      settings = new TagSettings();
    }
    
    settings.allowPublicCreation = !!allowPublicCreation;
    await settings.save();

    res.json({ success: true, allowPublicCreation: settings.allowPublicCreation });
  } catch (err) {
    console.error('Failed to update tag creation policy:', err);
    res.status(500).json({ error: 'Failed to update tag creation policy' });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

app.get('/api/admin/pending-users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ role: { $regex: /^pending$/i } }).select('-password');
    res.json(pendingUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

app.put('/api/admin/approve-user/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { role: 'member' });
    res.json({ message: 'User approved successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

app.delete('/api/admin/reject-user/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ message: 'User request deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'pending' } }).select('-password').populate('tags');
    res.json(users);
  } catch (err) {
    console.error('Fetch admin users error:', err);
    res.status(500).json({ error: 'Failed to load members for management' });
  }
});

app.put('/api/admin/users/:userId/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const targetUserId = req.params.userId;
    const requesterId = req.user.id || req.user._id;

    const normalizedRole = role ? role.toLowerCase() : '';

    if (!['admin', 'member', 'board'].includes(normalizedRole)) {
      return res.status(400).json({ error: 'Invalid role specification.' });
    }

    if (targetUserId.toString() === requesterId.toString() && normalizedRole === 'member') {
      return res.status(400).json({ error: 'You cannot revoke your own admin access.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { role: role },
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: 'Role updated successfully', user: updatedUser });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const requesterId = req.user.id || req.user._id;

    if (targetUserId.toString() === requesterId.toString()) {
      return res.status(400).json({ error: 'You cannot delete your own account from the admin panel.' });
    }

    const deletedUser = await User.findByIdAndDelete(targetUserId);

    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: 'User account deleted successfully.' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

app.post('/api/admin/assembly/start', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await AssemblySession.updateMany({ status: 'active' }, { status: 'closed' });

    const hostUserId = req.user.id || req.user._id;

    const newSession = new AssemblySession({
      title: req.body.title || 'General Assembly',
      hostId: hostUserId,
      status: 'active',
      attendees: [],
    });

    await newSession.save();

    const sessionIdStr = newSession._id.toString();

    res.status(201).json({
      message: 'Assembly session created',
      assembly: {
        _id: sessionIdStr,
        sessionId: sessionIdStr,
        title: newSession.title,
        status: newSession.status,
        qrCodeValue: JSON.stringify({ sessionId: sessionIdStr, title: newSession.title }),
      },
    });
  } catch (err) {
    console.error('Error starting assembly session:', err);
    res.status(500).json({ error: 'Failed to create assembly session' });
  }
});

app.put('/api/admin/assembly/close-active', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await AssemblySession.updateMany({ status: 'active' }, { status: 'closed' });
    res.json({ message: 'All active sessions closed successfully' });
  } catch (err) {
    console.error('Error closing active sessions:', err);
    res.status(500).json({ error: 'Failed to close assembly session on server' });
  }
});

app.put('/api/admin/assembly/:id/close', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const session = await AssemblySession.findByIdAndUpdate(
      req.params.id,
      { status: 'closed' },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: 'Assembly session not found' });
    }

    res.json({ message: 'Assembly session closed successfully', session });
  } catch (err) {
    console.error('Error closing assembly session:', err);
    res.status(500).json({ error: 'Failed to close assembly session on server' });
  }
});

app.get('/api/admin/assembly/:id/attendees', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const session = await AssemblySession.findById(req.params.id).populate(
      'attendees.userId',
      'name email inscriptionNumber'
    );

    if (!session) {
      return res.status(404).json({ error: 'Assembly session not found' });
    }

    const formattedAttendees = session.attendees.map((item) => ({
      _id: item._id,
      name: item.userId?.name || 'Member',
      email: item.userId?.email || '',
      inscriptionNumber: item.userId?.inscriptionNumber || 'N/A',
      timestamp: item.checkedInAt,
    }));

    res.json({ attendees: formattedAttendees });
  } catch (err) {
    console.error('Fetch attendees error:', err);
    res.status(500).json({ error: 'Failed to fetch assembly attendees' });
  }
});

// ==========================================
// GENERAL ASSEMBLY CHECK-IN ROUTES (MEMBERS)
// ==========================================

app.get('/api/assembly/session/active', authenticateToken, async (req, res) => {
  try {
    const activeSession = await AssemblySession.findOne({ status: 'active' }).populate(
      'attendees.userId',
      'name email inscriptionNumber'
    );
    res.json(activeSession || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active session' });
  }
});

app.post('/api/assembly/checkin', authenticateToken, async (req, res) => {
  try {
    let { sessionId } = req.body;

    if (typeof sessionId === 'string' && sessionId.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(sessionId);
        sessionId = parsed.sessionId || sessionId;
      } catch (e) {}
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required for check-in' });
    }

    const session = await AssemblySession.findById(sessionId);
    if (!session || session.status !== 'active') {
      return res.status(400).json({ error: 'Assembly session is either expired or invalid' });
    }

    const currentUserId = req.user.id || req.user._id;

    const alreadyCheckedIn = session.attendees.some(
      (a) => a.userId && a.userId.toString() === currentUserId.toString()
    );

    if (alreadyCheckedIn) {
      return res.status(200).json({ message: 'You are already checked into this session!' });
    }

    session.attendees.push({ userId: currentUserId, checkedInAt: new Date() });
    await session.save();

    res.status(200).json({ message: 'Check-in successful! Attendance logged.' });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Failed to record check-in' });
  }
});

app.get('/api/assembly/sessions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sessions = await AssemblySession.find()
      .populate('attendees.userId', 'name email inscriptionNumber')
      .sort({ createdAt: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch historical assembly sessions' });
  }
});

// ==========================================
// POSTS ROUTES
// ==========================================
app.get('/api/posts', authenticateToken, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate({
        path: 'author',
        select: 'name email role tags',
        populate: { path: 'tags' }
      })
      .populate({
        path: 'comments.user',
        select: 'name email'
      })
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.post('/api/posts', authenticateToken, upload.single('media'), async (req, res) => {
  try {
    const { content, category } = req.body;
    const userId = req.user.id || req.user._id;

    if (!content && !req.file) {
      return res.status(400).json({ error: 'Post must contain text or media' });
    }

    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    }

    const newPost = new Post({
      author: userId,
      authorName: req.user.name || 'Member',
      authorRole: req.user.role || 'member',
      content: content || '',
      category: category || 'General',
      mediaUrl,
      mediaType,
    });

    await newPost.save();

    const populatedPost = await Post.findById(newPost._id).populate({
      path: 'author',
      select: 'name email role tags',
      populate: { path: 'tags' }
    });

    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.put('/api/posts/:id/like', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.user.id || req.user._id;
    const hasLiked = post.likes.includes(userId);

    if (hasLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();

    const updatedPost = await Post.findById(req.params.id)
      .populate({
        path: 'author',
        select: 'name email role tags',
        populate: { path: 'tags' }
      })
      .populate({
        path: 'comments.user',
        select: 'name email'
      });

    res.json(updatedPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update like status' });
  }
});

app.post('/api/posts/:id/comment', authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.user.id || req.user._id;

    post.comments.push({
      user: userId,
      text: text.trim(),
    });

    await post.save();

    const updatedPost = await Post.findById(req.params.id)
      .populate({
        path: 'author',
        select: 'name email role tags',
        populate: { path: 'tags' }
      })
      .populate({
        path: 'comments.user',
        select: 'name email'
      });

    res.json(updatedPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.user.id || req.user._id;
    const isAuthor = post.author?.toString() === userId.toString() || post.authorId?.toString() === userId.toString();
    const isAdmin = String(req.user.role).toLowerCase() === 'admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ==========================================
// USER PROFILE ROUTE
// ==========================================
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).select('-password').populate('tags');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const userId = req.user.id || req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

    if (name && name.trim()) user.name = name.trim();
    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        inscriptionNumber: user.inscriptionNumber,
        dateOfBirth: user.dateOfBirth,
        tags: user.tags || [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ==========================================
// CHAT & MESSAGING ROUTES
// ==========================================
app.get('/api/users/members', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const members = await User.find({ role: { $ne: 'pending' }, _id: { $ne: userId } }).select(
      'name email role _id inscriptionNumber'
    );
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'name role email')
      .sort({ updatedAt: -1 });
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.post('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const { recipientId, participantIds, isGroup, groupName } = req.body;
    const userId = req.user.id || req.user._id;

    if (!isGroup) {
      let existingConv = await Conversation.findOne({
        isGroup: false,
        participants: { $all: [userId, recipientId], $size: 2 },
      }).populate('participants', 'name role email');

      if (existingConv) return res.json(existingConv);

      const newConv = new Conversation({
        isGroup: false,
        participants: [userId, recipientId],
      });
      await newConv.save();
      return res.json(await newConv.populate('participants', 'name role email'));
    }

    const allParticipants = Array.from(new Set([...participantIds, userId]));
    const newGroup = new Conversation({
      isGroup: true,
      groupName: groupName || 'New Group',
      participants: allParticipants,
    });
    await newGroup.save();
    res.json(await newGroup.populate('participants', 'name role email'));
  } catch (err) {
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

app.get('/api/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const messages = await ChatMessage.find({ conversationId: req.params.id }).sort({
      createdAt: 1,
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// ==========================================
// EVENT SCHEMA & ROUTES WITH NOTIFICATIONS
// ==========================================
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    date: { type: String, required: true },
    time: String,
    location: String,
    category: {
      type: String,
      enum: ['Competition', 'Build Session', 'Workshop', 'General'],
      default: 'General',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rsvps: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

const Event = mongoose.model('Event', eventSchema);

app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.post('/api/events', authenticateToken, async (req, res) => {
  try {
    const { title, description, date, time, location, category } = req.body;
    if (!title || !date) {
      return res.status(400).json({ error: 'Title and Date are required.' });
    }

    const userId = req.user.id || req.user._id;

    const newEvent = new Event({
      title,
      description,
      date,
      time,
      location,
      category,
      createdBy: userId,
      rsvps: [userId],
    });

    await newEvent.save();

    const membersToNotify = await User.find({
      _id: { $ne: userId },
      pushToken: { $ne: null },
    }).select('pushToken');

    const tokens = membersToNotify.map((u) => u.pushToken);
    if (tokens.length > 0) {
      await sendPushNotifications(
        tokens,
        `📅 New Event Scheduled: ${title}`,
        `${date}${time ? ' at ' + time : ''}${location ? ' - ' + location : ''}`,
        { type: 'EVENT', eventId: newEvent._id }
      );
    }

    res.status(201).json(newEvent);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event on server' });
  }
});

app.put('/api/events/:id/rsvp', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const userId = (req.user.id || req.user._id).toString();
    const hasRsvped = event.rsvps.some((id) => id.toString() === userId);

    if (hasRsvped) {
      event.rsvps = event.rsvps.filter((id) => id.toString() !== userId);
    } else {
      event.rsvps.push(userId);
    }

    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update RSVP' });
  }
});

// ==========================================
// SOCKET.IO REAL-TIME CHAT WITH AUTH
// ==========================================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: Token required'));
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error: Invalid token'));
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  socket.on('join_conversation', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(conversationId);
  });

  socket.on('send_private_message', async (data) => {
    try {
      const { conversationId, text, senderId, senderName } = data;
      const currentUserId = socket.user.id || socket.user._id;

      const newMessage = new ChatMessage({
        conversationId,
        senderId: senderId || currentUserId,
        senderName: senderName || socket.user.name,
        text,
      });
      await newMessage.save();

      const conv = await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: text,
        updatedAt: Date.now(),
      }).populate('participants');

      io.to(conversationId).emit('receive_private_message', newMessage);

      const recipientsToNotify = conv.participants.filter(
        (p) => p._id.toString() !== (senderId || currentUserId).toString() && p.pushToken
      );

      const tokens = recipientsToNotify.map((p) => p.pushToken);
      if (tokens.length > 0) {
        await sendPushNotifications(
          tokens,
          `💬 Message from ${senderName || socket.user.name}`,
          text.length > 50 ? `${text.substring(0, 50)}...` : text,
          { type: 'CHAT', conversationId }
        );
      }
    } catch (err) {
      console.error('Socket error:', err);
    }
  });
});

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});