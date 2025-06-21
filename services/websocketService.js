const WebSocket = require('ws');
const EventEmitter = require('events');

class WebSocketService extends EventEmitter {
  constructor(server) {
    super();
    this.wss = new WebSocket.Server({ server, path: '/logs' });
    this.clients = new Set();
    this.logBuffer = [];
    this.maxBufferSize = 1000;
    this.initialize();
  }

  initialize() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      this.sendLogBuffer(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });
  }

  broadcastLog(logData) {
    this.logBuffer.push({ ...logData, timestamp: new Date().toISOString() });
    if (this.logBuffer.length > this.maxBufferSize) this.logBuffer.shift();
    const message = JSON.stringify({ type: 'log', data: logData });
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  broadcastSystemStatus(status) {
    const message = JSON.stringify({ type: 'system_status', data: status });
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  sendLogBuffer(ws) {
    const message = JSON.stringify({ type: 'log_buffer', data: this.logBuffer });
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}

module.exports = WebSocketService; 