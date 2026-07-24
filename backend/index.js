const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
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

const app = express();
const server = http.createServer(app);
const expo = new Expo();

const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Serve uploaded media files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
  .connect(process.env.MONGO_URI)
  .then(() => console.log('🔌 Connected securely to MongoDB Cloud Database'))
  .catch((err) => console.error('❌ Database connection failed:', err));

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['pending', 'member', 'admin'], default: 'pending' },
    pushToken: { type: String, default: null },
  },
  { timestamps: true }
);

const User = mongoose.model('User', UserSchema);

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

// Middleware: Require Admin Role
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
};

// Save / Update Push Token Route
app.put('/api/users/push-token', authenticateToken, async (req, res) => {
  try {
    const { pushToken } = req.body;
    await User.findByIdAndUpdate(req.user.id, { pushToken });
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
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
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
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

    if (user.role === 'pending') {
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
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server login error' });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get pending user approvals
app.get('/api/admin/pending-users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ role: 'pending' }).select('-password');
    res.json(pendingUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

// Approve user
app.put('/api/admin/approve-user/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { role: 'member' });
    res.json({ message: 'User approved successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Reject user
app.delete('/api/admin/reject-user/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ message: 'User request deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Start a new General Assembly session (Matches AdminView.js endpoint)
app.post('/api/admin/assembly/start', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Close prior active sessions
    await AssemblySession.updateMany({ status: 'active' }, { status: 'closed' });

    const newSession = new AssemblySession({
      title: req.body.title || 'General Assembly',
      hostId: req.user.id,
      status: 'active',
      attendees: [],
    });

    await newSession.save();

    res.status(201).json({
      message: 'Assembly session created',
      assembly: {
        _id: newSession._id,
        sessionId: newSession._id.toString(),
        title: newSession.title,
        status: newSession.status,
      },
    });
  } catch (err) {
    console.error('Error starting assembly session:', err);
    res.status(500).json({ error: 'Failed to create assembly session' });
  }
});

// Admin: Get real-time attendees for a specific session (Matches AdminView.js polling)
app.get('/api/admin/assembly/:id/attendees', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const session = await AssemblySession.findById(req.params.id).populate(
      'attendees.userId',
      'name email'
    );

    if (!session) {
      return res.status(404).json({ error: 'Assembly session not found' });
    }

    const formattedAttendees = session.attendees.map((item) => ({
      _id: item._id,
      name: item.userId?.name || 'Member',
      email: item.userId?.email || '',
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

// Get currently active session info
app.get('/api/assembly/session/active', authenticateToken, async (req, res) => {
  try {
    const activeSession = await AssemblySession.findOne({ status: 'active' }).populate(
      'attendees.userId',
      'name email'
    );
    res.json(activeSession || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active session' });
  }
});

// Members: Check into a session via QR Code scan
app.post('/api/assembly/checkin', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required for check-in' });
    }

    const session = await AssemblySession.findById(sessionId);
    if (!session || session.status !== 'active') {
      return res.status(400).json({ error: 'Assembly session is either expired or invalid' });
    }

    const alreadyCheckedIn = session.attendees.some(
      (a) => a.userId.toString() === req.user.id.toString()
    );

    if (alreadyCheckedIn) {
      return res.status(200).json({ message: 'You are already checked into this session!' });
    }

    session.attendees.push({ userId: req.user.id, checkedInAt: new Date() });
    await session.save();

    res.status(200).json({ message: 'Check-in successful! Attendance logged.' });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Failed to record check-in' });
  }
});

// Admin: Get all historical assembly sessions
app.get('/api/assembly/sessions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sessions = await AssemblySession.find()
      .populate('attendees.userId', 'name email')
      .sort({ createdAt: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch historical assembly sessions' });
  }
});

// ==========================================
// POSTS ROUTES
// ==========================================
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.post('/api/posts', upload.single('media'), async (req, res) => {
  try {
    const { authorName, authorRole, content, category } = req.body;
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
      authorName: authorName || 'Builder',
      authorRole: authorRole || 'member',
      content: content || '',
      category: category || 'General',
      mediaUrl,
      mediaType,
    });

    await newPost.save();
    res.status(201).json(newPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.put('/api/posts/:id/like', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.user.id;
    const hasLiked = post.likes.includes(userId);

    if (hasLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();
    res.json({ likesCount: post.likes.length, likes: post.likes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update like status' });
  }
});

app.post('/api/posts/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { text, parentId } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const newComment = {
      authorName: req.user.name || 'Builder',
      authorId: req.user.id,
      text: text.trim(),
      parentId: parentId || null,
    };

    post.comments.push(newComment);
    await post.save();

    res.status(201).json(post.comments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isAuthor = post.authorName === req.user.name || post.authorId?.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

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
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
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
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
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
    const members = await User.find({ role: { $ne: 'pending' }, _id: { $ne: req.user.id } }).select(
      'name email role _id'
    );
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user.id })
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

    if (!isGroup) {
      let existingConv = await Conversation.findOne({
        isGroup: false,
        participants: { $all: [req.user.id, recipientId], $size: 2 },
      }).populate('participants', 'name role email');

      if (existingConv) return res.json(existingConv);

      const newConv = new Conversation({
        isGroup: false,
        participants: [req.user.id, recipientId],
      });
      await newConv.save();
      return res.json(await newConv.populate('participants', 'name role email'));
    }

    const allParticipants = Array.from(new Set([...participantIds, req.user.id]));
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

// CREATE EVENT + TRIGGER PUSH NOTIFICATION TO ALL MEMBERS
app.post('/api/events', authenticateToken, async (req, res) => {
  try {
    const { title, description, date, time, location, category } = req.body;
    if (!title || !date) {
      return res.status(400).json({ error: 'Title and Date are required.' });
    }

    const newEvent = new Event({
      title,
      description,
      date,
      time,
      location,
      category,
      createdBy: req.user.id,
      rsvps: [req.user.id],
    });

    await newEvent.save();

    // 🔔 Notify all members except creator
    const membersToNotify = await User.find({
      _id: { $ne: req.user.id },
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

    const userId = req.user.id;
    const hasRsvped = event.rsvps.includes(userId);

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
// SOCKET.IO REAL-TIME CHAT WITH NOTIFICATIONS
// ==========================================
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

      const newMessage = new ChatMessage({
        conversationId,
        senderId,
        senderName,
        text,
      });
      await newMessage.save();

      const conv = await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: text,
        updatedAt: Date.now(),
      }).populate('participants');

      // Emit real-time message via socket
      io.to(conversationId).emit('receive_private_message', newMessage);

      // 🔔 Push notification for offline/background chat recipients
      const recipientsToNotify = conv.participants.filter(
        (p) => p._id.toString() !== senderId && p.pushToken
      );

      const tokens = recipientsToNotify.map((p) => p.pushToken);
      if (tokens.length > 0) {
        await sendPushNotifications(
          tokens,
          `💬 Message from ${senderName}`,
          text.length > 50 ? `${text.substring(0, 50)}...` : text,
          { type: 'CHAT', conversationId }
        );
      }
    } catch (err) {
      console.error('Socket error:', err);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});