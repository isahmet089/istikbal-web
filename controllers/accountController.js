const Account = require('../models/accountModel');
const Log = require('../models/logModel');
const Session = require('../models/sessionModel');
const playwrightService = require('../services/playwrightService');
const csvService = require('../services/csvService');

function parseDateSafe(dateStr) {
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  if (typeof dateStr === 'string' && dateStr.length >= 10) {
    return new Date(dateStr.substring(0, 10));
  }
  return new Date();
}

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

  async getHealthStatus(req, res) {
    try {
      const healthStatus = playwrightService.getHealthMonitorStatus();
      res.json({ success: true, healthStatus });
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

  async getCalendarData(req, res) {
    try {
      const { username } = req.params;
      const { start, send } = req.query;
      
      const startDate = parseDateSafe(start);
      const endDate = parseDateSafe(end);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Geçersiz tarih formatı' });
      }
      
      const sessions = await Session.find({
        username: username,
        startTime: { $gte: startDate, $lte: endDate }
      }).sort('startTime');
      const dailyStats = {};
      sessions.forEach(session => {
        const date = session.startTime.toISOString().split('T')[0];
        if (!dailyStats[date]) {
          dailyStats[date] = {
            totalDuration: 0,
            sessionCount: 0,
            sessions: []
          };
        }
        dailyStats[date].totalDuration += session.duration || 0;
        dailyStats[date].sessionCount += 1;
        dailyStats[date].sessions.push(session);
      });
      const events = Object.entries(dailyStats).map(([date, stats]) => {
        const totalMinutes = stats.totalDuration;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        let title = '';
        if (hours > 0) {
          title += `${hours} saat `;
        }
        if (minutes > 0 || hours === 0) {
          title += `${minutes} dk`;
        }

        const totalHours = totalMinutes / 60;
        
        // Renk belirleme
        let color = '#dc3545'; // Kırmızı (2 saatten az)
        if (totalHours >= 4) {
          color = '#28a745'; // Yeşil (4 saatten fazla)
        } else if (totalHours >= 2) {
          color = '#ffc107'; // Sarı (2-4 saat arası)
        }
        
        return {
          id: date,
          title: title.trim(),
          start: date,
          backgroundColor: color,
          extendedProps: {
            totalHours: Math.round(totalHours * 10) / 10,
            sessionCount: stats.sessionCount,
            sessions: stats.sessions
          }
        };
      });
      res.json({ success: true, events });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getDayDetails(req, res) {
    try {
      const { username, date } = req.params;
      // UTC gün başlangıcı ve bitişi
      const startOfDay = new Date(date + "T00:00:00.000Z");//kanadaya deploy ettiğinde z yi kaldır 
      const endOfDay = new Date(date + "T23:59:59.999Z");//kanadaya deploy ettiğinde z yi kaldır 
      
      console.log('🔍 Debug - getDayDetails:', {
        username,
        date,
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString()
      });
      
      const sessions = await Session.find({
        username: username,
        startTime: { $gte: startOfDay, $lte: endOfDay }
      }).sort('startTime');
      
      console.log('🔍 Debug - Bulunan session sayısı:', sessions.length);
      console.log('🔍 Debug - Session detayları:', sessions.map(s => ({
        id: s._id,
        startTime: s.startTime,
        duration: s.duration,
        status: s.status
      })));
      
      const totalDuration = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);
      const totalHours = Math.round((totalDuration / 60) * 10) / 10;
      
      // IP istatistiklerini hesapla
      const ipStats = await Session.getIPStats(username, startOfDay, endOfDay);
      
      res.json({
        success: true,
        date,
        totalHours,
        totalDuration,
        ipStats,
        sessions: sessions.map(session => ({
          id: session._id,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.duration,
          status: session.status,
          portalIP: session.ipInfo?.portalIP || session.portalIP || 'N/A',
          canvasIP: session.ipInfo?.canvasIP || session.canvasIP || 'N/A',
          geoInfo: session.ipInfo?.geoInfo || { proxy: false },
          ipChanges: session.ipInfo?.ipChanges || []
        }))
      });
    } catch (error) {
      console.error('❌ getDayDetails hatası:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new AccountController(); 