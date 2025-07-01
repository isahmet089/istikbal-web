const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const accountCRUDController = require('../controllers/accountCRUDController');
const Account = require('../models/accountModel');

// Dashboard route
router.get('/', async (req, res) => {
  try {
    const total = await Account.countDocuments();
    const active = await Account.countDocuments({ status: 'success' });
    const failed = await Account.countDocuments({ status: 'failed' });
    res.render('dashboard', {
      summary: {
        total,
        active,
        failed
      }
    });
  } catch (err) {
    res.render('dashboard', { summary: { total: 0, active: 0, failed: 0 } });
  }
});

// Account Management Routes
router.get('/accounts', (req, res) => {
  res.render('accounts');
});

// API Routes
router.post('/api/import', accountController.importAccounts);
router.get('/api/accounts', accountController.getAccounts);
router.get('/api/logs', accountController.getLogs);
router.get('/api/sessions/:username', accountController.getSessionStats);
router.get('/api/health', accountController.getHealthStatus);
router.post('/api/start', accountController.startAutomation);
router.post('/api/stop', accountController.stopAutomation);

// Account CRUD API Routes
router.get('/api/accounts/crud', accountCRUDController.getAllAccounts);
router.get('/api/accounts/crud/search', accountCRUDController.searchAccounts);
router.get('/api/accounts/crud/:id', accountCRUDController.getAccountById);
router.post('/api/accounts/crud', accountCRUDController.createAccount);
router.put('/api/accounts/crud/:id', accountCRUDController.updateAccount);
router.delete('/api/accounts/crud/:id', accountCRUDController.deleteAccount);
router.patch('/api/accounts/crud/:id/toggle-status', accountCRUDController.toggleAccountStatus);
router.patch('/api/accounts/crud/:id/toggle-browser', accountCRUDController.toggleBrowserStatus);
router.post('/api/accounts/crud/bulk-update', accountCRUDController.bulkUpdateStatus);
router.post('/api/accounts/crud/bulk-delete', accountCRUDController.bulkDelete);

// Calendar routes
router.get('/calendar/:username', (req, res) => {
  res.render('calendar', { username: req.params.username });
});

// Canlı loglar sayfası
router.get('/logs', (req, res) => {
  res.render('live-logs');
});

router.get('/api/calendar/:username', accountController.getCalendarData);
router.get('/api/calendar/:username/day/:date', accountController.getDayDetails);

module.exports = router; 