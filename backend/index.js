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

const Post = require('./Post');
const Conversation = require('./Conversation');
const ChatMessage = require('./ChatMessage');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Serve uploaded media files statically so the app can render them
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure Multer Storage for photos/videos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file limit
});

// ==========================================
// DATABASE & MIDDLEWARE
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🔌 Connected securely to MongoDB Cloud Database'))
  .catch((err) => console.error('❌ Database connection failed:', err));

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['pending', 'member', 'admin'], default: 'pending' }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// Authentication Middleware to secure likes, comments, and chats
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

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// REGISTER ROUTE
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user with default 'pending' role
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'pending'
    });

    await newUser.save();

    res.status(201).json({ message: "Registration successful! Please wait for admin approval." });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Server registration error" });
  }
});

// LOGIN ROUTE (With Pending User Block)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid credentials" });

    // 🛑 Block pending users from logging in
    if (user.role === 'pending') {
      return res.status(403).json({ error: "Your account is pending admin approval. Please wait for an administrator to activate your account." });
    }

    const token = jwt.sign({ id: user._id, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server login error" });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================
app.get('/api/admin/pending-users', async (req, res) => {
  try {
    const pendingUsers = await User.find({ role: 'pending' }).select('-password');
    res.json(pendingUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

app.put('/api/admin/approve-user/:id', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { role: 'member' });
    res.json({ message: 'User approved successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Delete/Reject a pending member request
app.delete('/api/admin/reject-user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User request deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      mediaType
    });

    await newPost.save();
    res.status(201).json(newPost);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// LIKE / UNLIKE ROUTE
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

// ADD COMMENT ROUTE
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
      parentId: parentId || null
    };

    post.comments.push(newComment);
    await post.save();

    res.status(201).json(post.comments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// ==========================================
// CHAT & MESSAGING ROUTES
// ==========================================
app.get('/api/users/members', authenticateToken, async (req, res) => {
  try {
    const members = await User.find({ role: { $ne: 'pending' }, _id: { $ne: req.user.id } })
      .select('name email role _id');
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
        participants: { $all: [req.user.id, recipientId], $size: 2 }
      }).populate('participants', 'name role email');

      if (existingConv) return res.json(existingConv);

      const newConv = new Conversation({
        isGroup: false,
        participants: [req.user.id, recipientId]
      });
      await newConv.save();
      return res.json(await newConv.populate('participants', 'name role email'));
    }

    const allParticipants = Array.from(new Set([...participantIds, req.user.id]));
    const newGroup = new Conversation({
      isGroup: true,
      groupName: groupName || 'New Group',
      participants: allParticipants
    });
    await newGroup.save();
    res.json(await newGroup.populate('participants', 'name role email'));
  } catch (err) {
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

app.get('/api/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const messages = await ChatMessage.find({ conversationId: req.params.id })
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// ==========================================
// SOCKET.IO ROOM MANAGEMENT
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
        text
      });
      await newMessage.save();

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: text,
        updatedAt: Date.now()
      });

      io.to(conversationId).emit('receive_private_message', newMessage);
    } catch (err) {
      console.error('Socket error:', err);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server listening on port ${PORT}`);
});
// Change Password Route
app.put('/api/users/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    // Hash and save new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});