const mongoose = require('mongoose');

// Schema for individual comments (supports nested replies)
const commentSchema = new mongoose.Schema({
  authorName: { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Null = top-level comment, ID = reply
  createdAt: { type: Date, default: Date.now }
});

// Schema for posts
const postSchema = new mongoose.Schema(
  {
    authorName: { type: String, required: true },
    authorRole: { type: String, default: 'member' },
    content: { type: String, default: '' },
    category: { type: String, default: 'General' },
    mediaUrl: { type: String, default: null },
    mediaType: { type: String, enum: ['image', 'video', null], default: null },
    
    // Array of User IDs who liked this post
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    
    // Embedded comments supporting nested reply threads
    comments: [commentSchema]
  },
  { timestamps: true } // Automatically manages createdAt and updatedAt
);

module.exports = mongoose.model('Post', postSchema);