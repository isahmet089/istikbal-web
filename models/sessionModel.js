const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number, // Duration in minutes
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'interrupted'],
    default: 'active'
  },
  // Detaylı IP adresi bilgileri
  ipInfo: {
    portalIP: {
      type: String,
      default: 'IP alınamadı'
    },
    canvasIP: {
      type: String,
      default: 'IP alınamadı'
    },
    // IP değişiklik takibi
    ipChanges: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      platform: {
        type: String,
        enum: ['portal', 'canvas'],
        required: true
      },
      oldIP: String,
      newIP: String,
      reason: String // 'proxy_change', 'network_change', 'manual_change' vb.
    }],
    // IP coğrafi bilgileri (gelecekte eklenebilir)
    geoInfo: {
      country: String,
      city: String,
      isp: String,
      proxy: {
        type: Boolean,
        default: false
      }
    }
  },
  // Geriye uyumluluk için eski alanları koruyalım
  portalIP: {
    type: String,
    default: 'IP alınamadı'
  },
  canvasIP: {
    type: String,
    default: 'IP alınamadı'
  }
});

// IP değişikliği kaydetme metodu
sessionSchema.methods.addIPChange = function(platform, oldIP, newIP, reason = 'unknown') {
  this.ipInfo.ipChanges.push({
    timestamp: new Date(),
    platform,
    oldIP,
    newIP,
    reason
  });
  
  // Ana IP alanlarını güncelle
  if (platform === 'portal') {
    this.ipInfo.portalIP = newIP;
    this.portalIP = newIP; // Geriye uyumluluk
  } else if (platform === 'canvas') {
    this.ipInfo.canvasIP = newIP;
    this.canvasIP = newIP; // Geriye uyumluluk
  }
  
  return this.save();
};

// IP bilgilerini güncelleme metodu
sessionSchema.methods.updateIPInfo = function(portalIP, canvasIP) {
  // Portal IP değişikliği kontrolü
  if (this.ipInfo.portalIP !== portalIP && portalIP !== 'IP alınamadı') {
    this.addIPChange('portal', this.ipInfo.portalIP, portalIP, 'login_update');
  }
  
  // Canvas IP değişikliği kontrolü
  if (this.ipInfo.canvasIP !== canvasIP && canvasIP !== 'IP alınamadı') {
    this.addIPChange('canvas', this.ipInfo.canvasIP, canvasIP, 'login_update');
  }
  
  return this.save();
};

// Günlük toplam süreyi hesaplamak için static method
sessionSchema.statics.getDailyStats = async function(username) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const stats = await this.aggregate([
    {
      $match: {
        username: username,
        startTime: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      }
    },
    {
      $group: {
        _id: null,
        totalDuration: { $sum: '$duration' },
        activeSessions: {
          $sum: {
            $cond: [{ $eq: ['$isActive', true] }, 1, 0]
          }
        }
      }
    }
  ]);

  return stats[0] || { totalDuration: 0, activeSessions: 0 };
};

// IP istatistikleri için yeni method
sessionSchema.statics.getIPStats = async function(username, startDate, endDate) {
  const sessions = await this.find({
    username: username,
    startTime: { $gte: startDate, $lte: endDate }
  }).select('ipInfo startTime endTime');
  
  const ipStats = {
    uniqueIPs: new Set(),
    portalIPs: new Set(),
    canvasIPs: new Set(),
    ipChanges: 0,
    proxyUsage: 0
  };
  
  sessions.forEach(session => {
    if (session.ipInfo) {
      if (session.ipInfo.portalIP && session.ipInfo.portalIP !== 'IP alınamadı') {
        ipStats.uniqueIPs.add(session.ipInfo.portalIP);
        ipStats.portalIPs.add(session.ipInfo.portalIP);
      }
      if (session.ipInfo.canvasIP && session.ipInfo.canvasIP !== 'IP alınamadı') {
        ipStats.uniqueIPs.add(session.ipInfo.canvasIP);
        ipStats.canvasIPs.add(session.ipInfo.canvasIP);
      }
      if (session.ipInfo.ipChanges) {
        ipStats.ipChanges += session.ipInfo.ipChanges.length;
      }
      if (session.ipInfo.geoInfo && session.ipInfo.geoInfo.proxy) {
        ipStats.proxyUsage++;
      }
    }
  });
  
  return {
    uniqueIPCount: ipStats.uniqueIPs.size,
    portalIPCount: ipStats.portalIPs.size,
    canvasIPCount: ipStats.canvasIPs.size,
    totalIPChanges: ipStats.ipChanges,
    proxyUsageCount: ipStats.proxyUsage,
    uniqueIPs: Array.from(ipStats.uniqueIPs)
  };
};

module.exports = mongoose.model('Session', sessionSchema); 