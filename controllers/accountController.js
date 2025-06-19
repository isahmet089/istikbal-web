const Account = require('../models/accountModel');
const Log = require('../models/logModel');
const Session = require('../models/sessionModel');
const playwrightService = require('../services/playwrightService');
const csvService = require('../services/csvService');

class AccountController {
  async importAccounts(req, res) {
    try {
      const count = await csvService.importAccounts('accounts.csv');
      res.json({ success: true, message: `Imported ${count} accounts` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getAccounts(req, res) {
    try {
      const accounts = await Account.find().sort('-lastUpdated');
      
      // Get session stats for each account
      const accountsWithStats = await Promise.all(accounts.map(async (account) => {
        const stats = await Session.getDailyStats(account.username);
        return {
          ...account.toObject(),
          dailyStats: stats
        };
      }));
      
      res.json(accountsWithStats);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getLogs(req, res) {
    try {
      const logs = await Log.find()
        .sort('-timestamp')
        .limit(100);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSessionStats(req, res) {
    try {
      const { username } = req.params;
      const stats = await Session.getDailyStats(username);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async startAutomation(req, res) {
    try {
      await playwrightService.initialize();
      
      const accounts = await Account.find({ status: 'waiting' });
      const parallelSessions = parseInt(process.env.PARALLEL_SESSIONS) || 5;
      
      // Process accounts in batches
      for (let i = 0; i < accounts.length; i += parallelSessions) {
        const batch = accounts.slice(i, i + parallelSessions);
        await Promise.all(batch.map(account => playwrightService.login(account)));
      }

      res.json({ success: true, message: 'Automation started' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async stopAutomation(req, res) {
    try {
      await playwrightService.close();
      await Account.updateMany(
        { browserOpen: true },
        { browserOpen: false, message: 'Session terminated' }
      );
      res.json({ success: true, message: 'Automation stopped' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new AccountController(); 