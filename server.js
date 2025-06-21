const http = require('http');
const app = require('./app');
const WebSocketService = require('./services/websocketService');
const AdvancedLogger = require('./services/advancedLogger');

const server = http.createServer(app);
const wsService = new WebSocketService(server);
const logger = new AdvancedLogger(wsService);

global.logger = logger;

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 