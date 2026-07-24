// backend/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    avatar: { 
      type: String, 
      default: null 
    },
    tags: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Tag' 
    }],
    email: { 
      type: String, 
      required: true, 
      unique: true, 
      lowercase: true, 
      trim: true 
    },
    password: { 
      type: String, 
      required: true 
    },
    inscriptionNumber: { 
      type: String, 
      required: true, 
      unique: true, 
      sparse: true,
      trim: true 
    },
    dateOfBirth: { 
      type: Date, 
      required: false 
    },
    role: { 
      type: String, 
      enum: ['pending', 'member', 'admin', 'board'], 
      default: 'pending' 
    },
    pushToken: { 
      type: String, 
      default: null 
    },
    isApproved: { 
      type: Boolean, 
      default: false 
    }
  },
  { 
    timestamps: true 
  }
);

module.exports = mongoose.model('User', UserSchema);