const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');

// Dashboard route
router.get('/', (req, res) => {
  res.render('dashboard');
});

// API Routes
router.post('/api/import', accountController.importAccounts);
router.get('/api/accounts', accountController.getAccounts);
router.get('/api/logs', accountController.getLogs);
router.get('/api/sessions/:username', accountController.getSessionStats);
router.post('/api/start', accountController.startAutomation);
router.post('/api/stop', accountController.stopAutomation);

module.exports = router; 