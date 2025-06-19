const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    required: true
  },
  reason: String,
  details: mongoose.Schema.Types.Mixed
});

module.exports = mongoose.model('Log', logSchema); 