const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Post = require('../models/Post'); // Adjust path to your Post model
const authMiddleware = require('../middleware/auth'); // Adjust path to your auth middleware

// Configure Multer for media uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Ensure 'uploads' directory exists in your root folder
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'), false);
    }
  },
});

// ==========================================
// 1. GET ALL POSTS
// ==========================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('author', 'name role tags avatar')
      .populate('comments.authorId', 'name avatar')
      .sort({ createdAt: -1 });

    res.status(200).json(posts);
  } catch (error) {
    console.error('Fetch posts error:', error);
    res.status(500).json({ error: 'Failed to retrieve posts' });
  }
});

// ==========================================
// 2. CREATE A NEW POST
// ==========================================
router.post('/', authMiddleware, upload.single('media'), async (req, res) => {
  try {
    const { content, category, authorName } = req.body;
    const user = req.user; // Set by authMiddleware

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User missing' });
    }

    // Determine author name fallback
    const resolvedAuthorName =
      user.name || authorName || req.body.authorName || 'Anonymous User';

    // Construct media URL relative to server root
    let mediaUrl = null;
    let mediaType = null;
    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    }

    const newPost = new Post({
      author: user._id,
      authorName: resolvedAuthorName,
      authorRole: user.role || 'member',
      content: content || '',
      category: category || 'General',
      mediaUrl,
      mediaType,
      likes: [],
      comments: [],
    });

    await newPost.save();

    // Re-fetch with populated author details
    const populatedPost = await Post.findById(newPost._id).populate('author', 'name role tags avatar');

    res.status(201).json(populatedPost);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: error.message || 'Failed to create post' });
  }
});

// ==========================================
// 3. DELETE A POST
// ==========================================
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if the requesting user is the post owner or an admin
    const isOwner = post.author && post.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Post deleted successfully', postId: req.params.id });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ==========================================
// 4. LIKE / UNLIKE A POST
// ==========================================
router.put('/:id/like', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const userId = req.user._id;
    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      // Unlike post
      post.likes = post.likes.filter((id) => id.toString() !== userId.toString());
    } else {
      // Like post
      post.likes.push(userId);
    }

    await post.save();

    const updatedPost = await Post.findById(post._id)
      .populate('author', 'name role tags avatar')
      .populate('comments.authorId', 'name avatar');

    res.status(200).json(updatedPost);
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to update like status' });
  }
});

// ==========================================
// 5. ADD A COMMENT TO A POST
// ==========================================
router.post('/:id/comment', authMiddleware, async (req, res) => {
  try {
    const { text, parentId } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const newComment = {
      authorName: req.user.name || 'Member',
      authorId: req.user._id,
      text: text.trim(),
      parentId: parentId || null,
      createdAt: new Date(),
    };

    post.comments.push(newComment);
    await post.save();

    const updatedPost = await Post.findById(post._id)
      .populate('author', 'name role tags avatar')
      .populate('comments.authorId', 'name avatar');

    res.status(201).json(updatedPost);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

module.exports = router;