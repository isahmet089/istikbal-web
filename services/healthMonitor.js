const Account = require('../models/accountModel');
const Log = require('../models/logModel');

class HealthMonitor {
  constructor(playwrightService) {
    this.playwrightService = playwrightService;
    this.healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 300000; // 5 dakika
    this.checkTimeout = 30000; // 30 saniye
    this.isRunning = false;
  }

  async startHealthMonitoring() {
    if (this.isRunning) {
      global.logger?.warning('Health monitoring zaten çalışıyor');
      return;
    }

    this.isRunning = true;
    global.logger?.info('🏥 Health monitoring başlatıldı', { 
      interval: `${this.healthCheckInterval / 60000} dakika` 
    });

    this.monitoringInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckInterval);

    await this.performHealthChecks();
  }

  async stopHealthMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    global.logger?.info('🏥 Health monitoring durduruldu');
  }

  async performHealthChecks() {
    try {
      const activeAccounts = await Account.find({ 
        browserOpen: true, 
        status: { $in: ['success', 'partial_failed'] } 
      });

      if (activeAccounts.length === 0) {
        global.logger?.info('🔍 Aktif hesap bulunamadı, health check atlanıyor');
        return;
      }

      global.logger?.info(`🔍 ${activeAccounts.length} aktif hesap için health check başlatılıyor`);

      const batchSize = 3;
      for (let i = 0; i < activeAccounts.length; i += batchSize) {
        const batch = activeAccounts.slice(i, i + batchSize);
        await Promise.all(batch.map(account => this.checkAccountHealth(account)));
        await this.delay(2000);
      }

    } catch (error) {
      global.logger?.error('❌ Health check genel hatası', { error: error.message });
    }
  }

  async checkAccountHealth(account) {
    try {
      global.logger?.info(`🔍 ${account.username} sağlık kontrolü başlatılıyor`);

      const session = this.playwrightService.activeSessions.get(account.username);
      if (!session || !session.pages) {
        global.logger?.warning(`⚠️ ${account.username} için aktif session bulunamadı`);
        await this.handleOfflineUser(account, 'Session bulunamadı');
        return;
      }

      const { page1, page2 } = session.pages;

      const [portalHealth, canvasHealth] = await Promise.allSettled([
        this.checkPortalHealth(page1, account),
        this.checkCanvasHealth(page2, account)
      ]);

      const portalStatus = portalHealth.status === 'fulfilled' ? portalHealth.value : false;
      const canvasStatus = canvasHealth.status === 'fulfilled' ? canvasHealth.value : false;

      if (portalStatus && canvasStatus) {
        await this.handleHealthyUser(account, 'Her iki site de aktif');
      } else if (portalStatus || canvasStatus) {
        await this.handlePartiallyHealthyUser(account, {
          portal: portalStatus,
          canvas: canvasStatus
        });
      } else {
        await this.handleOfflineUser(account, 'Her iki site de offline');
      }

    } catch (error) {
      global.logger?.error(`❌ ${account.username} health check hatası`, { error: error.message });
      await this.handleOfflineUser(account, `Health check hatası: ${error.message}`);
    }
  }

  async checkPortalHealth(page, account) {
    try {
      global.logger?.info(`🏥 ${account.username} Portal kontrol ediliyor...`);

      await page.goto('https://myaolcc.ca/studentportal/my-profile/', {
        waitUntil: 'networkidle',
        timeout: this.checkTimeout
      });

      await this.delay(3000);

      const pageInfo = await page.evaluate(() => {
        // Login sayfasında mı kontrol et
        const loginForm = document.querySelector('input[name="username"]');
        const loginButton = document.querySelector('input[type="submit"]');
        const signInButton = document.querySelector('button[type="submit"]');
        
        // Eğer login formu veya butonları varsa, giriş yapılmamış
        if (loginForm || loginButton || signInButton) {
          return { isLoggedIn: false, reason: 'Login formu bulundu' };
        }
        
        // Welcome text kontrolü
        const welcomeText = document.querySelector('h1');
        if (welcomeText && welcomeText.textContent.includes('Welcome')) {
          return { isLoggedIn: true, reason: 'Welcome text bulundu' };
        }
        
        // Profile sayfası elementleri
        const profileContent = document.querySelector('.profile-content') || 
                              document.querySelector('.user-profile') ||
                              document.querySelector('.student-profile');
        
        // Dashboard elementleri
        const dashboardElements = document.querySelector('.dashboard') ||
                                 document.querySelector('.content-area') ||
                                 document.querySelector('.main-content');
        
        // Campus seçenekleri (login sonrası görünür)
        const campusOptions = document.querySelectorAll('h6');
        const hasCampusOptions = Array.from(campusOptions).some(h6 => 
          h6.textContent.includes('Campus')
        );
        
        // Herhangi bir içerik var mı kontrol et
        const hasContent = document.querySelector('body').textContent.length > 100;
        const hasForm = document.querySelector('form');
        
        // Login sayfası değilse ve içerik varsa, giriş yapılmış
        if (profileContent) {
          return { isLoggedIn: true, reason: 'Profile content bulundu' };
        }
        if (dashboardElements) {
          return { isLoggedIn: true, reason: 'Dashboard elements bulundu' };
        }
        if (hasCampusOptions) {
          return { isLoggedIn: true, reason: 'Campus options bulundu' };
        }
        if (hasContent && !hasForm) {
          return { isLoggedIn: true, reason: 'İçerik var, form yok' };
        }
        
        return { isLoggedIn: false, reason: 'Hiçbir login göstergesi bulunamadı' };
      });

      global.logger?.info(`🏥 ${account.username} Portal durumu: ${pageInfo.isLoggedIn ? 'Online' : 'Offline'} - ${pageInfo.reason}`);
      return pageInfo.isLoggedIn;

    } catch (error) {
      global.logger?.error(`❌ ${account.username} Portal health check hatası`, { error: error.message });
      return false;
    }
  }

  async checkCanvasHealth(page, account) {
    try {
      global.logger?.info(`🎨 ${account.username} Canvas kontrol ediliyor...`);

      await page.goto('https://mynew.aolcc.ca/profile/communication', {
        waitUntil: 'networkidle',
        timeout: this.checkTimeout
      });

      await this.delay(3000);

      const pageInfo = await page.evaluate(() => {
        // Login sayfasında mı kontrol et
        const loginForm = document.querySelector('#pseudonym_session_unique_id');
        const loginButton = document.querySelector('input[type="submit"]');
        const emailField = document.querySelector('input[type="email"]');
        
        // Eğer login formu veya butonları varsa, giriş yapılmamış
        if (loginForm || loginButton || emailField) {
          return { isLoggedIn: false, reason: 'Login formu bulundu' };
        }
        
        // Communication sayfası elementleri
        const communicationContent = document.querySelector('.communication-preferences') ||
                                   document.querySelector('.profile-content') ||
                                   document.querySelector('.user-preferences');
        
        // Dashboard elementleri
        const dashboardElements = document.querySelector('.dashboard-header') ||
                                 document.querySelector('.user_name') ||
                                 document.querySelector('.courses') ||
                                 document.querySelector('.dashboard');
        
        // Canvas özel elementleri
        const canvasElements = document.querySelector('.ic-app') ||
                              document.querySelector('.ic-Layout') ||
                              document.querySelector('.ic-Dashboard');
        
        // Profile sayfası başlığı
        const profileTitle = document.querySelector('h1');
        const hasProfileTitle = profileTitle && (
          profileTitle.textContent.includes('Profile') ||
          profileTitle.textContent.includes('Communication') ||
          profileTitle.textContent.includes('Preferences')
        );
        
        // Herhangi bir içerik var mı kontrol et
        const hasContent = document.querySelector('body').textContent.length > 100;
        const hasForm = document.querySelector('form');
        
        // Login sayfası değilse ve içerik varsa, giriş yapılmış
        if (communicationContent) {
          return { isLoggedIn: true, reason: 'Communication content bulundu' };
        }
        if (dashboardElements) {
          return { isLoggedIn: true, reason: 'Dashboard elements bulundu' };
        }
        if (canvasElements) {
          return { isLoggedIn: true, reason: 'Canvas elements bulundu' };
        }
        if (hasProfileTitle) {
          return { isLoggedIn: true, reason: 'Profile title bulundu' };
        }
        if (hasContent && !hasForm) {
          return { isLoggedIn: true, reason: 'İçerik var, form yok' };
        }
        
        return { isLoggedIn: false, reason: 'Hiçbir login göstergesi bulunamadı' };
      });

      global.logger?.info(`🎨 ${account.username} Canvas durumu: ${pageInfo.isLoggedIn ? 'Online' : 'Offline'} - ${pageInfo.reason}`);
      return pageInfo.isLoggedIn;

    } catch (error) {
      global.logger?.error(`❌ ${account.username} Canvas health check hatası`, { error: error.message });
      return false;
    }
  }

  async handleHealthyUser(account, message) {
    try {
      global.logger?.success(`✅ ${account.username} tamamen sağlıklı`, { message });
      
      await Account.findByIdAndUpdate(account._id, {
        status: 'success',
        message: message,
        lastHealthCheck: new Date(),
        healthStatus: 'healthy'
      });

      await Log.create({
        username: account.username,
        status: 'success',
        reason: `Health check: ${message}`
      });

    } catch (error) {
      global.logger?.error(`${account.username} sağlıklı kullanıcı güncelleme hatası`, { error: error.message });
    }
  }

  async handlePartiallyHealthyUser(account, status) {
    try {
      const message = `Portal: ${status.portal ? 'Online' : 'Offline'}, Canvas: ${status.canvas ? 'Online' : 'Offline'}`;
      
      global.logger?.warning(`⚠️ ${account.username} kısmi sağlık sorunu`, { status });
      
      await Account.findByIdAndUpdate(account._id, {
        status: 'partial_failed',
        message: message,
        lastHealthCheck: new Date(),
        healthStatus: 'partial'
      });

      await Log.create({
        username: account.username,
        status: 'partial_failed',
        reason: `Health check: ${message}`
      });

      if (!status.portal && !status.canvas) {
        global.logger?.info(`🔄 ${account.username} için yeniden login deneniyor...`);
        await this.triggerReLogin(account);
      }

    } catch (error) {
      global.logger?.error(`${account.username} kısmi sağlık güncelleme hatası`, { error: error.message });
    }
  }

  async handleOfflineUser(account, reason) {
    try {
      global.logger?.error(`❌ ${account.username} offline tespit edildi`, { reason });
      
      await Account.findByIdAndUpdate(account._id, {
        status: 'failed',
        browserOpen: false,
        message: `Offline: ${reason}`,
        lastHealthCheck: new Date(),
        healthStatus: 'offline'
      });

      await Log.create({
        username: account.username,
        status: 'failed',
        reason: `Health check: ${reason}`
      });

      await this.playwrightService.endSession(account.username);

      global.logger?.info(`🔄 ${account.username} için yeniden login deneniyor...`);
      await this.triggerReLogin(account);

    } catch (error) {
      global.logger?.error(`${account.username} offline kullanıcı güncelleme hatası`, { error: error.message });
    }
  }

  async triggerReLogin(account) {
    try {
      await Account.findByIdAndUpdate(account._id, {
        status: 'waiting',
        message: 'Yeniden login bekleniyor'
      });

      global.logger?.info(`🔄 ${account.username} yeniden login kuyruğa eklendi`);
      
      setTimeout(async () => {
        try {
          const updatedAccount = await Account.findById(account._id);
          if (updatedAccount && updatedAccount.status === 'waiting') {
            global.logger?.info(`🔄 ${account.username} yeniden login başlatılıyor...`);
            await this.playwrightService.login(updatedAccount);
          }
        } catch (error) {
          global.logger?.error(`${account.username} yeniden login hatası`, { error: error.message });
        }
      }, 30000);

    } catch (error) {
      global.logger?.error(`${account.username} yeniden login tetikleme hatası`, { error: error.message });
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getHealthStatus() {
    return {
      isRunning: this.isRunning,
      interval: this.healthCheckInterval,
      activeSessions: this.playwrightService.getActiveSessionsCount()
    };
  }
}

module.exports = HealthMonitor; 