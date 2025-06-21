const winston = require('winston');
const path = require('path');

class AdvancedLogger {
  constructor(websocketService) {
    this.ws = websocketService;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: path.join('logs', 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join('logs', 'combined.log') }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  log(level, message, data = {}) {
    const logEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    this.logger.log(level, message, data);
    this.ws.broadcastLog(logEntry);
  }

  info(message, data = {}) {
    this.log('info', message, data);
  }
  success(message, data = {}) {
    this.log('success', message, data);
  }
  warning(message, data = {}) {
    this.log('warning', message, data);
  }
  error(message, data = {}) {
    this.log('error', message, data);
  }
  userAction(username, action, details = {}) {
    this.log('user_action', `${username}: ${action}`, { username, action, ...details });
  }
  systemAction(action, details = {}) {
    this.log('system_action', action, details);
  }
  batchAction(batchNumber, action, details = {}) {
    this.log('batch_action', `Batch ${batchNumber}: ${action}`, { batchNumber, action, ...details });
  }
  healthCheck(username, status, details = {}) {
    this.log('health_check', `${username} sağlık kontrolü: ${status}`, { username, status, ...details });
  }
}

module.exports = AdvancedLogger; 