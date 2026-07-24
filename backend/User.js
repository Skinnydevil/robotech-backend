// backend/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
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
      trim: true 
    },
    dateOfBirth: { 
      type: Date, 
      required: true 
    },
    role: { 
      type: String, 
      enum: ['Member', 'Admin'], 
      default: 'Member' 
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