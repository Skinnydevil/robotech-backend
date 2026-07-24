const mongoose = require('mongoose');

// Schema for individual comments
const commentSchema = new mongoose.Schema({
  authorName: { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Schema for posts
const postSchema = new mongoose.Schema(
  {
    // ADD THIS: Reference to the User model so .populate('author') works
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    authorName: { type: String, required: true },
    authorRole: { type: String, default: 'member' },
    content: { type: String, default: '' },
    category: { type: String, default: 'General' },
    mediaUrl: { type: String, default: null },
    mediaType: { type: String, enum: ['image', 'video', null], default: null },
    
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [commentSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Post', postSchema);