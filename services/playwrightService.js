const { chromium } = require('playwright');
const Account = require('../models/accountModel');
const Log = require('../models/logModel');
const Session = require('../models/sessionModel');
const { randomDelay } = require('../utils/randomDelay');
const HealthMonitor = require('./healthMonitor');

class PlaywrightService {
  constructor() {
    this.browser = null;
    this.activeSessions = new Map();
    this.isInitialized = false;
    this.maxRetries = 3;
    this.sessionDuration = parseInt(process.env.SESSION_DURATION) || 4 * 60 * 60 * 1000; // 4 saat
    this.healthMonitor = new HealthMonitor(this);
  }

  async initialize() {
    try {
      if (this.isInitialized && this.browser) {
        global.logger?.info('Browser zaten başlatılmış');
        return true;
      }

      global.logger?.info('🌐 Browser başlatılıyor...');
      
      this.browser = await chromium.launch({ 
        headless: false,
        args: [
          '--start-maximized',
          '--disable-extensions',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        executablePath: process.platform === 'win32' 
          ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
          : undefined
      });
      
      this.isInitialized = true;
      global.logger?.success('✅ Browser başarıyla başlatıldı');
      
      // Health monitoring başlat
      await this.healthMonitor.startHealthMonitoring();
      
      return true;
    } catch (error) {
      global.logger?.error('❌ Browser başlatma hatası', { error: error.message });
      this.isInitialized = false;
      return false;
    }
  }

  async login(account) {
    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Browser başlatılamadı');
      }
    }

    let context = null;
    let retryCount = 0;

    while (retryCount < this.maxRetries) {
      try {
        global.logger?.info(`🔄 ${account.username} için login deneniyor (${retryCount + 1}/${this.maxRetries})`);
        
        context = await this.browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ignoreHTTPSErrors: true
        });

        const result = await this.performLogin(context, account);
        
        if (result.success) {
          await this.setupSession(account, context, result);
          return true;
        } else {
          retryCount++;
          if (retryCount < this.maxRetries) {
            global.logger?.warning(`⚠️ ${account.username} login başarısız, yeniden deneniyor...`);
            await randomDelay(5000, 10000);
          }
        }
      } catch (error) {
        global.logger?.error(`❌ ${account.username} login hatası`, { 
          error: error.message, 
          retry: retryCount + 1 
        });
        retryCount++;
        
        if (context) {
          try {
            await context.close();
          } catch (closeError) {
            global.logger?.error('Context kapatma hatası', { error: closeError.message });
          }
        }
        
        if (retryCount >= this.maxRetries) {
          await this.handleLoginFailure(account, error);
          return false;
        }
        
        await randomDelay(3000, 6000);
      }
    }

    return false;
  }

  async performLogin(context, account) {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    try {
      global.logger?.info(`🌐 ${account.username} sayfalar yükleniyor...`);
      
      await Promise.all([
        page1.goto('https://myaolcc.ca/studentportal/', {
          waitUntil: 'networkidle',
          timeout: 30000
        }),
        page2.goto('https://mynew.aolcc.ca/login/canvas', {
          waitUntil: 'networkidle',
          timeout: 30000
        })
      ]);

      await randomDelay(2000, 4000);

      const [portalSuccess, canvasSuccess] = await Promise.allSettled([
        this.loginToStudentPortal(page1, account),
        this.loginToCanvas(page2, account)
      ]);

      const portalResult = portalSuccess.status === 'fulfilled' ? portalSuccess.value : false;
      const canvasResult = canvasSuccess.status === 'fulfilled' ? canvasSuccess.value : false;

      await this.takeScreenshots(page1, page2, account, portalResult, canvasResult);

      return {
        success: portalResult || canvasResult,
        portal: portalResult,
        canvas: canvasResult,
        pages: { page1, page2 }
      };

    } catch (error) {
      global.logger?.error(`${account.username} login işlemi hatası`, { error: error.message });
      return { success: false, portal: false, canvas: false };
    }
  }

  async loginToStudentPortal(page, account) {
    try {
      global.logger?.info(`🔐 ${account.username} Portal login başlatılıyor...`);
      
      await page.waitForSelector('#emailForm', { 
        state: 'visible',
        timeout: 15000 
      });

      await page.fill('#emailForm', account.username);
      await randomDelay(1000, 2000);

      await page.fill('#pwdform', account.password);
      await randomDelay(1000, 2000);

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        page.click('.btnlogin')
      ]);

      await randomDelay(3000, 5000);

      const isSuccess = await page.evaluate(() => {
        const welcomeTitle = document.querySelector('h2.contentTitle');
        const logoutButton = document.querySelector('a[href*="logout"]');
        return (welcomeTitle && welcomeTitle.textContent.includes('Welcome to AOL')) || logoutButton;
      });

      global.logger?.success(`✅ ${account.username} Portal login ${isSuccess ? 'başarılı' : 'başarısız'}`);
      return isSuccess;

    } catch (error) {
      global.logger?.error(`${account.username} Portal login hatası`, { error: error.message });
      return false;
    }
  }

  async loginToCanvas(page, account) {
    try {
      global.logger?.info(`🎨 ${account.username} Canvas login başlatılıyor...`);
      
      await page.waitForSelector('#pseudonym_session_unique_id', { 
        state: 'visible',
        timeout: 15000 
      });

      await page.fill('#pseudonym_session_unique_id', account.username);
      await randomDelay(1000, 2000);

      await page.fill('#pseudonym_session_password', account.password);
      await randomDelay(1000, 2000);

      const loginButton = await page.$('input[type="submit"][value="Oturum Aç"]') || 
                         await page.$('input[type="submit"][value="Log In"]') ||
                         await page.$('input[type="submit"]');

      if (!loginButton) {
        throw new Error('Login butonu bulunamadı');
      }

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        loginButton.click()
      ]);

      await randomDelay(3000, 5000);

      const isSuccess = await page.evaluate(() => {
        const dashboardText = document.querySelector('span.hidden-phone');
        const userMenu = document.querySelector('.user_name');
        const courses = document.querySelector('.courses');
        return (dashboardText && dashboardText.textContent.includes('Kontrol Paneli')) || 
               userMenu || courses;
      });

      global.logger?.success(`✅ ${account.username} Canvas login ${isSuccess ? 'başarılı' : 'başarısız'}`);
      return isSuccess;

    } catch (error) {
      global.logger?.error(`${account.username} Canvas login hatası`, { error: error.message });
      return false;
    }
  }

  async setupSession(account, context, result) {
    try {
      const overallStatus = result.portal && result.canvas ? 'success' : 'partial_failed';
      const message = `Portal: ${result.portal ? 'Başarılı' : 'Başarısız'}, Canvas: ${result.canvas ? 'Başarılı' : 'Başarısız'}`;

      await Account.findByIdAndUpdate(account._id, {
        status: overallStatus,
        browserOpen: true,
        loginTime: new Date(),
        message: message
      });

      const session = await Session.create({
        username: account.username,
        startTime: new Date(),
        status: 'active'
      });

      this.activeSessions.set(account.username, {
        sessionId: session._id,
        startTime: new Date(),
        context: context,
        pages: result.pages,
        updateInterval: setInterval(async () => {
          await this.updateSessionDuration(session._id);
        }, 60000)
      });

      await Log.create({
        username: account.username,
        status: overallStatus,
        reason: message
      });

      global.logger?.success(`🎉 ${account.username} oturum başlatıldı`, { 
        status: overallStatus, 
        sessionId: session._id 
      });

      setTimeout(async () => {
        await this.endSession(account.username);
      }, this.sessionDuration);

    } catch (error) {
      global.logger?.error(`${account.username} session kurulum hatası`, { error: error.message });
    }
  }

  async takeScreenshots(page1, page2, account, portalSuccess, canvasSuccess) {
    try {
      const timestamp = Date.now();
      await Promise.allSettled([
        page1.screenshot({ 
          path: `./screenshots/${account.username}-portal-${portalSuccess ? 'success' : 'failed'}-${timestamp}.png`,
          fullPage: true 
        }),
        page2.screenshot({ 
          path: `./screenshots/${account.username}-canvas-${canvasSuccess ? 'success' : 'failed'}-${timestamp}.png`,
          fullPage: true 
        })
      ]);
    } catch (error) {
      global.logger?.error(`${account.username} screenshot alma hatası`, { error: error.message });
    }
  }

  async handleLoginFailure(account, error) {
    try {
      await Log.create({
        username: account.username,
        status: 'failed',
        reason: `Maksimum deneme sayısına ulaşıldı: ${error.message}`
      });

      await Account.findByIdAndUpdate(account._id, {
        status: 'failed',
        browserOpen: false,
        message: `Login başarısız: ${error.message}`
      });

      global.logger?.error(`❌ ${account.username} login tamamen başarısız`, { 
        error: error.message,
        maxRetries: this.maxRetries 
      });
    } catch (dbError) {
      global.logger?.error(`${account.username} hata kaydetme sorunu`, { error: dbError.message });
    }
  }

  async updateSessionDuration(sessionId) {
    try {
      const session = await Session.findById(sessionId);
      if (session && session.isActive) {
        const now = new Date();
        const durationInMinutes = Math.floor((now - session.startTime) / 60000);
        
        await Session.findByIdAndUpdate(sessionId, {
          duration: durationInMinutes
        });
      }
    } catch (error) {
      global.logger?.error('Session süre güncelleme hatası', { error: error.message });
    }
  }

  async endSession(username) {
    try {
      const activeSession = this.activeSessions.get(username);
      if (!activeSession) return;

      global.logger?.info(`⏰ ${username} oturumu kapatılıyor...`);

      if (activeSession.updateInterval) {
        clearInterval(activeSession.updateInterval);
      }

      if (activeSession.context) {
        try {
          await activeSession.context.close();
        } catch (error) {
          global.logger?.error(`${username} context kapatma hatası`, { error: error.message });
        }
      }

      const now = new Date();
      const durationInMinutes = Math.floor((now - activeSession.startTime) / 60000);
      
      await Session.findByIdAndUpdate(activeSession.sessionId, {
        endTime: now,
        duration: durationInMinutes,
        isActive: false,
        status: 'completed'
      });

      await Account.findOneAndUpdate(
        { username: username },
        { browserOpen: false, message: 'Oturum tamamlandı' }
      );

      this.activeSessions.delete(username);

      global.logger?.success(`✅ ${username} oturumu başarıyla kapatıldı`, { 
        duration: durationInMinutes 
      });

    } catch (error) {
      global.logger?.error(`${username} oturum kapatma hatası`, { error: error.message });
    }
  }

  async close() {
    try {
      global.logger?.info('🔄 Tüm oturumlar kapatılıyor...');
      
      // Health monitoring durdur
      await this.healthMonitor.stopHealthMonitoring();
      
      const usernames = Array.from(this.activeSessions.keys());
      await Promise.all(usernames.map(username => this.endSession(username)));

      if (this.browser) {
        global.logger?.info('🌐 Browser kapatılıyor...');
        await this.browser.close();
        this.browser = null;
        this.isInitialized = false;
        global.logger?.success('✅ Browser başarıyla kapatıldı');
      }
    } catch (error) {
      global.logger?.error('❌ Browser kapatma hatası', { error: error.message });
    }
  }

  getActiveSessionsCount() {
    return this.activeSessions.size;
  }

  getActiveUsernames() {
    return Array.from(this.activeSessions.keys());
  }

  getHealthMonitorStatus() {
    return this.healthMonitor.getHealthStatus();
  }
}

module.exports = new PlaywrightService(); 