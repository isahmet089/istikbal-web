const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
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

// API Routes
router.post('/api/import', accountController.importAccounts);
router.get('/api/accounts', accountController.getAccounts);
router.get('/api/logs', accountController.getLogs);
router.get('/api/sessions/:username', accountController.getSessionStats);
router.post('/api/start', accountController.startAutomation);
router.post('/api/stop', accountController.stopAutomation);

// Calendar routes
router.get('/calendar/:username', (req, res) => {
  res.render('calendar', { username: req.params.username });
});

router.get('/api/calendar/:username', accountController.getCalendarData);
router.get('/api/calendar/:username/day/:date', accountController.getDayDetails);

module.exports = router; 