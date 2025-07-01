require('dotenv').config();

module.exports = {
  sessionDuration: parseInt(process.env.SESSION_DURATION) || 4 * 60 * 60 * 1000, // 4 saat
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  ipCheckInterval: parseInt(process.env.IP_CHECK_INTERVAL) || 5 * 60 * 1000, // 5 dakika
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 300000 // 5 dakika
};