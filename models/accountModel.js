const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['waiting', 'success', 'failed', 'partial_failed'],
    default: 'waiting'
  },
  browserOpen: {
    type: Boolean,
    default: false
  },
  loginTime: Date,
  message: String,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Account', accountSchema); 