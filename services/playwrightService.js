/**
 * PlaywrightService - Browser Automation Service
 * 
 * Bu servis, AOLCC öğrenci portalına otomatik giriş yapmak için Playwright kullanır.
 * Hem Student Portal hem de Canvas platformlarına paralel olarak giriş yapar.
 * 
 * Özellikler:
 * - Çift platform login (Portal + Canvas)
 * - Retry mekanizması (3 kez deneme)
 * - Şifre yanlış durumu tespiti
 * - Otomatik session yönetimi
 * - Screenshot alma
 * - Health monitoring
 * - Memory management
 */

const { chromium } = require('playwright');
const Account = require('../models/accountModel');
const Log = require('../models/logModel');
const Session = require('../models/sessionModel');
const { randomDelay } = require('../utils/randomDelay');
const HealthMonitor = require('./healthMonitor');

/**
 * PlaywrightService Sınıfı
 * Browser otomasyonu için ana servis sınıfı
 */
class PlaywrightService {
  
  /**
   * Constructor - Servis başlatma
   * Browser instance'ı ve aktif session'ları yönetir
   */
  constructor() {
    this.browser = null;                    // Chrome browser instance
    this.activeSessions = new Map();        // Aktif oturumları tutan Map (username -> sessionData)
    this.isInitialized = false;             // Browser başlatıldı mı?
    this.maxRetries = 3;                    // Maksimum yeniden deneme sayısı
    this.sessionDuration = parseInt(process.env.SESSION_DURATION) || 4 * 60 * 60 * 1000; // 4 saat (milisaniye)
    this.healthMonitor = new HealthMonitor(this); // Sağlık kontrolü servisi
  }

  /**
   * Browser Başlatma
   * Chrome browser'ı başlatır ve gerekli ayarları yapar
   * 
   * @returns {Promise<boolean>} Browser başarıyla başlatıldı mı?
   */
  async initialize() {
    try {
      // Browser zaten başlatılmışsa tekrar başlatma
      if (this.isInitialized && this.browser) {
        global.logger?.info('Browser zaten başlatılmış');
        return true;
      }

      global.logger?.info('🌐 Browser başlatılıyor...');
      
      // Chrome browser'ı başlat
      this.browser = await chromium.launch({ 
        headless: false,  // Görünür modda çalıştır (debug için)
        args: [
          '--start-maximized',        // Tam ekran başlat
          '--disable-extensions',     // Eklentileri devre dışı bırak (performans)
          '--no-sandbox',            // Sandbox'ı kapat (güvenlik)
          '--disable-setuid-sandbox', // Setuid sandbox'ı kapat
          '--disable-dev-shm-usage',  // Shared memory kullanımını kapat
          '--disable-accelerated-2d-canvas', // 2D canvas hızlandırmayı kapat
          '--no-first-run',          // İlk çalıştırma ekranını atla
          '--no-zygote',             // Zygote process'i kapat
          '--disable-gpu'            // GPU hızlandırmayı kapat
        ],
        executablePath: process.platform === 'win32' 
          ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Windows Chrome yolu
          : undefined
      });
      
      this.isInitialized = true;
      global.logger?.success('✅ Browser başarıyla başlatıldı');
      
      // Health monitoring başlat (düzenli sağlık kontrolü)
      await this.healthMonitor.startHealthMonitoring();
      
      return true;
    } catch (error) {
      global.logger?.error('❌ Browser başlatma hatası', { error: error.message });
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Ana Login Metodu
   * Bir hesap için login işlemini başlatır ve yönetir
   * 
   * @param {Object} account - Giriş yapılacak hesap bilgileri
   * @param {string} account.username - Kullanıcı adı
   * @param {string} account.password - Şifre
   * @returns {Promise<boolean>} Login başarılı mı?
   */
  async login(account) {
    // Browser başlatılmamışsa başlat
    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Browser başlatılamadı');
      }
    }

    let context = null;  // Browser context (her hesap için ayrı)
    let retryCount = 0;  // Deneme sayacı

    // Maksimum retry sayısı kadar dene
    while (retryCount < this.maxRetries) {
      try {
        global.logger?.info(`🔄 ${account.username} için login deneniyor (${retryCount + 1}/${this.maxRetries})`);
        
        // Her hesap için yeni browser context oluştur
        context = await this.browser.newContext({
          viewport: { width: 1920, height: 1080 }, // Ekran boyutu
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Gerçekçi user agent
          ignoreHTTPSErrors: true      // HTTPS hatalarını görmezden gel
        });

        // Çift platform login işlemini gerçekleştir
        const result = await this.performLogin(context, account);
        
        // Şifre yanlış durumunu kontrol et (retry yapma)
        if (result.portalErrorType === 'invalid_credentials' || result.canvasErrorType === 'invalid_credentials') {
          global.logger?.warning(`🔒 ${account.username} şifre yanlış - Browser kapatılıyor ve retry edilmeyecek`);
          
          // Context'i kapat (memory temizliği)
          try {
            await context.close();
          } catch (closeError) {
            global.logger?.error('Context kapatma hatası', { error: closeError.message });
          }
          
          // Şifre yanlış durumunda retry etme, direkt failed olarak işaretle
          await this.handleLoginFailure(account, new Error('Şifre veya kullanıcı adı yanlış'));
          return false;
        }
        
        // Login başarılı ise session kur
        if (result.success) {
          await this.setupSession(account, context, result);
          return true;
        } else {
          // Login başarısız, yeniden dene
          retryCount++;
          if (retryCount < this.maxRetries) {
            global.logger?.warning(`⚠️ ${account.username} login başarısız, yeniden deneniyor...`);
            await randomDelay(5000, 10000); // 5-10 saniye bekle
          }
        }
      } catch (error) {
        // Hata durumunda context'i kapat ve yeniden dene
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
        
        // Maksimum deneme sayısına ulaşıldıysa başarısız olarak işaretle
        if (retryCount >= this.maxRetries) {
          await this.handleLoginFailure(account, error);
          return false;
        }
        
        await randomDelay(3000, 6000); // 3-6 saniye bekle
      }
    }

    return false;
  }

  /**
   * Çift Platform Login İşlemi
   * Hem Student Portal hem de Canvas'a aynı anda giriş yapar
   * 
   * @param {Object} context - Browser context
   * @param {Object} account - Hesap bilgileri
   * @returns {Promise<Object>} Login sonuçları
   */
  async performLogin(context, account) {
    // İki sayfa oluştur - Portal ve Canvas için
    const page1 = await context.newPage(); // Student Portal
    const page2 = await context.newPage(); // Canvas

    try {
      global.logger?.info(`🌐 ${account.username} sayfalar yükleniyor...`);
      
      // İki sayfayı aynı anda yükle (paralel işlem)
      await Promise.all([
        page1.goto('https://myaolcc.ca/studentportal/', {
          waitUntil: 'networkidle', // Sayfa tamamen yüklenene kadar bekle
          timeout: 30000            // 30 saniye timeout
        }),
        page2.goto('https://mynew.aolcc.ca/login/canvas', {
          waitUntil: 'networkidle',
          timeout: 30000
        })
      ]);

      await randomDelay(2000, 4000); // 2-4 saniye bekle

      // İki platforma aynı anda login ol (paralel işlem)
      const [portalSuccess, canvasSuccess] = await Promise.allSettled([
        this.loginToStudentPortal(page1, account),
        this.loginToCanvas(page2, account)
      ]);

      // Promise sonuçlarını işle
      const portalResult = portalSuccess.status === 'fulfilled' ? portalSuccess.value : { success: false, error: 'Promise rejected', errorType: 'exception' };
      const canvasResult = canvasSuccess.status === 'fulfilled' ? canvasSuccess.value : { success: false, error: 'Promise rejected', errorType: 'exception' };

      // Screenshot al (başarılı/başarısız durumları için)
      await this.takeScreenshots(page1, page2, account, portalResult.success, canvasResult.success);

      // Hata detaylarını logla
      if (!portalResult.success && portalResult.error) {
        global.logger?.warning(`⚠️ ${account.username} Portal hatası: ${portalResult.error}`, {
          errorType: portalResult.errorType,
          platform: 'portal'
        });
      }

      if (!canvasResult.success && canvasResult.error) {
        global.logger?.warning(`⚠️ ${account.username} Canvas hatası: ${canvasResult.error}`, {
          errorType: canvasResult.errorType,
          platform: 'canvas'
        });
      }

      // Sonuçları döndür
      return {
        success: portalResult.success || canvasResult.success, // En az biri başarılı olmalı
        portal: portalResult.success,
        canvas: canvasResult.success,
        portalError: portalResult.error,
        canvasError: canvasResult.error,
        portalErrorType: portalResult.errorType,
        canvasErrorType: canvasResult.errorType,
        pages: { page1, page2 } // Sayfaları session için sakla
      };

    } catch (error) {
      global.logger?.error(`${account.username} login işlemi hatası`, { error: error.message });
      return { 
        success: false, 
        portal: false, 
        canvas: false,
        portalError: error.message,
        canvasError: error.message,
        portalErrorType: 'exception',
        canvasErrorType: 'exception'
      };
    }
  }

  /**
   * Student Portal Login Metodu
   * AOLCC Student Portal'a giriş yapar
   * 
   * @param {Object} page - Playwright page object
   * @param {Object} account - Hesap bilgileri
   * @returns {Promise<Object>} Login sonucu {success, error, errorType}
   */
  async loginToStudentPortal(page, account) {
    try {
      global.logger?.info(`🔐 ${account.username} Portal login başlatılıyor...`);
      
      // Email form alanını bekle
      await page.waitForSelector('#emailForm', { 
        state: 'visible',
        timeout: 15000 
      });

      // Kullanıcı adını gir
      await page.fill('#emailForm', account.username);
      await randomDelay(1000, 2000);

      // Şifreyi gir
      await page.fill('#pwdform', account.password);
      await randomDelay(1000, 2000);

      // Login butonuna tıkla
      await page.click('.btnlogin');
      
      // Daha esnek navigation bekleme stratejisi (timeout sorunlarını önlemek için)
      try {
        // Önce domcontentloaded'ı bekle (daha hızlı)
        await page.waitForNavigation({ 
          waitUntil: 'domcontentloaded', 
          timeout: 15000 
        });
        
        // Sonra ek bekleme süresi
        await randomDelay(2000, 4000);
        
        // Sayfa tamamen yüklendi mi kontrol et (opsiyonel)
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
          global.logger?.warning(`⚠️ ${account.username} Portal networkidle timeout, devam ediliyor...`);
        });
        
      } catch (navError) {
        global.logger?.warning(`⚠️ ${account.username} Portal navigation timeout, sayfa durumu kontrol ediliyor...`);
        
        // Navigation timeout olsa bile sayfanın durumunu kontrol et
        await randomDelay(3000, 5000);
      }

      // Önce hata mesajlarını kontrol et
      const errorInfo = await page.evaluate(() => {
        // Şifre/kullanıcı adı yanlış hatası (#mail-status div'i)
        const errorDiv = document.querySelector('#mail-status');
        if (errorDiv) {
          const errorText = errorDiv.textContent || errorDiv.innerText;
          if (errorText.includes('wrong') || errorText.includes('yanlış')) {
            return {
              hasError: true,
              errorType: 'invalid_credentials',
              errorMessage: errorText.trim()
            };
          }
        }

        // Diğer hata mesajları (.alert.alert-danger)
        const alertDanger = document.querySelector('.alert.alert-danger');
        if (alertDanger) {
          const alertText = alertDanger.textContent || alertDanger.innerText;
          return {
            hasError: true,
            errorType: 'general_error',
            errorMessage: alertText.trim()
          };
        }

        return { hasError: false };
      });

      // Hata varsa logla ve false döndür
      if (errorInfo.hasError) {
        global.logger?.error(`❌ ${account.username} Portal login hatası: ${errorInfo.errorMessage}`, {
          errorType: errorInfo.errorType,
          platform: 'portal'
        });
        return { success: false, error: errorInfo.errorMessage, errorType: errorInfo.errorType };
      }

      // Başarı kontrolü - daha kapsamlı (birden fazla yöntemle kontrol)
      const isSuccess = await page.evaluate(() => {
        // 1. Welcome title kontrolü
        const welcomeTitle = document.querySelector('h2.contentTitle');
        if (welcomeTitle && welcomeTitle.textContent.includes('Welcome to AOL')) {
          return true;
        }
        
        // 2. Logout button kontrolü
        const logoutButton = document.querySelector('a[href*="logout"]');
        if (logoutButton) {
          return true;
        }
        
        // 3. Dashboard elementleri kontrolü
        const dashboardElements = document.querySelector('.dashboard') ||
                                 document.querySelector('.content-area') ||
                                 document.querySelector('.main-content');
        if (dashboardElements) {
          return true;
        }
        
        // 4. URL kontrolü - login sayfasında değilse başarılı
        const currentUrl = window.location.href;
        if (!currentUrl.includes('/login') && !currentUrl.includes('/signin')) {
          return true;
        }
        
        // 5. Login formu yoksa başarılı
        const loginForm = document.querySelector('#emailForm');
        if (!loginForm) {
          return true;
        }
        
        return false;
      });

      global.logger?.success(`✅ ${account.username} Portal login ${isSuccess ? 'başarılı' : 'başarısız'}`);
      return { success: isSuccess, error: null, errorType: null };

    } catch (error) {
      global.logger?.error(`${account.username} Portal login hatası`, { error: error.message });
      return { success: false, error: error.message, errorType: 'exception' };
    }
  }

  /**
   * Canvas Login Metodu
   * AOLCC Canvas platformuna giriş yapar
   * 
   * @param {Object} page - Playwright page object
   * @param {Object} account - Hesap bilgileri
   * @returns {Promise<Object>} Login sonucu {success, error, errorType}
   */
  async loginToCanvas(page, account) {
    try {
      global.logger?.info(`🎨 ${account.username} Canvas login başlatılıyor...`);
      
      // Username alanını bekle
      await page.waitForSelector('#pseudonym_session_unique_id', { 
        state: 'visible',
        timeout: 15000 
      });

      // Kullanıcı adını gir
      await page.fill('#pseudonym_session_unique_id', account.username);
      await randomDelay(1000, 2000);

      // Şifreyi gir
      await page.fill('#pseudonym_session_password', account.password);
      await randomDelay(1000, 2000);

      // Login butonunu bul (farklı diller için)
      const loginButton = await page.$('input[type="submit"][value="Oturum Aç"]') || 
                         await page.$('input[type="submit"][value="Log In"]') ||
                         await page.$('input[type="submit"]');

      if (!loginButton) {
        throw new Error('Login butonu bulunamadı');
      }

      // Login butonuna tıkla ve sayfa yüklenmesini bekle
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        loginButton.click()
      ]);

      await randomDelay(3000, 5000);

      // Önce hata mesajlarını kontrol et
      const errorInfo = await page.evaluate(() => {
        // Canvas hata mesajı kontrolü (.ic-flash-error.flash-message-container)
        const errorContainer = document.querySelector('.ic-flash-error.flash-message-container');
        if (errorContainer) {
          const errorText = errorContainer.textContent || errorContainer.innerText;
          if (errorText.includes('verify your username or password') || 
              errorText.includes('username or password') ||
              errorText.includes('yanlış')) {
            return {
              hasError: true,
              errorType: 'invalid_credentials',
              errorMessage: errorText.trim()
            };
          }
        }

        // Diğer Canvas hata mesajları (.ic-flash-error)
        const flashError = document.querySelector('.ic-flash-error');
        if (flashError) {
          const flashText = flashError.textContent || flashError.innerText;
          return {
            hasError: true,
            errorType: 'general_error',
            errorMessage: flashText.trim()
          };
        }

        return { hasError: false };
      });

      // Hata varsa logla ve false döndür
      if (errorInfo.hasError) {
        global.logger?.error(`❌ ${account.username} Canvas login hatası: ${errorInfo.errorMessage}`, {
          errorType: errorInfo.errorType,
          platform: 'canvas'
        });
        return { success: false, error: errorInfo.errorMessage, errorType: errorInfo.errorType };
      }

      // Başarı kontrolü
      const isSuccess = await page.evaluate(() => {
        // Dashboard text kontrolü
        const dashboardText = document.querySelector('span.hidden-phone');
        if (dashboardText && dashboardText.textContent.includes('Kontrol Paneli')) {
          return true;
        }
        
        // User menu kontrolü
        const userMenu = document.querySelector('.user_name');
        if (userMenu) {
          return true;
        }
        
        // Courses kontrolü
        const courses = document.querySelector('.courses');
        if (courses) {
          return true;
        }
        
        return false;
      });

      global.logger?.success(`✅ ${account.username} Canvas login ${isSuccess ? 'başarılı' : 'başarısız'}`);
      return { success: isSuccess, error: null, errorType: null };

    } catch (error) {
      global.logger?.error(`${account.username} Canvas login hatası`, { error: error.message });
      return { success: false, error: error.message, errorType: 'exception' };
    }
  }

  /**
   * Session Kurulum Metodu
   * Başarılı login sonrası session'ı başlatır ve yönetir
   * 
   * @param {Object} account - Hesap bilgileri
   * @param {Object} context - Browser context
   * @param {Object} result - Login sonuçları
   */
  async setupSession(account, context, result) {
    try {
      // Genel durumu belirle (her iki platform da başarılı mı?)
      const overallStatus = result.portal && result.canvas ? 'success' : 'partial_failed';
      
      // Detaylı mesaj oluştur
      let message = `Portal: ${result.portal ? 'Başarılı' : 'Başarısız'}, Canvas: ${result.canvas ? 'Başarılı' : 'Başarısız'}`;
      
      // Hata detaylarını ekle
      if (!result.portal && result.portalError) {
        message += ` | Portal Hatası: ${result.portalError}`;
      }
      if (!result.canvas && result.canvasError) {
        message += ` | Canvas Hatası: ${result.canvasError}`;
      }

      // Şifre yanlış durumlarını özel olarak handle et
      if (result.portalErrorType === 'invalid_credentials' || result.canvasErrorType === 'invalid_credentials') {
        // Log kaydı oluştur
        await Log.create({
          username: account.username,
          status: 'failed',
          reason: `Şifre/Kullanıcı adı yanlış - Portal: ${result.portalError || 'N/A'}, Canvas: ${result.canvasError || 'N/A'}`
        });

        // Hesap durumunu güncelle
        await Account.findByIdAndUpdate(account._id, {
          status: 'failed',
          browserOpen: false,
          message: 'Şifre veya kullanıcı adı yanlış'
        });

        global.logger?.error(`❌ ${account.username} kimlik bilgileri yanlış - Browser kapatıldı`, {
          portalError: result.portalError,
          canvasError: result.canvasError
        });

        return; // Session kurma, hesabı failed olarak işaretle
      }

      // Hesap durumunu güncelle
      await Account.findByIdAndUpdate(account._id, {
        status: overallStatus,
        browserOpen: true,
        loginTime: new Date(),
        message: message
      });

      // Yeni session oluştur
      const session = await Session.create({
        username: account.username,
        startTime: new Date(),
        status: 'active'
      });

      // Aktif session'ı Map'e ekle
      this.activeSessions.set(account.username, {
        sessionId: session._id,
        startTime: new Date(),
        context: context,
        pages: result.pages,
        updateInterval: setInterval(async () => {
          await this.updateSessionDuration(session._id);
        }, 60000) // Her dakika süreyi güncelle
      });

      // Log kaydı oluştur
      await Log.create({
        username: account.username,
        status: overallStatus,
        reason: message
      });

      global.logger?.success(`🎉 ${account.username} oturum başlatıldı`, { 
        status: overallStatus, 
        sessionId: session._id,
        portalError: result.portalError,
        canvasError: result.canvasError
      });

      // Session süresi dolduğunda otomatik kapat
      setTimeout(async () => {
        await this.endSession(account.username);
      }, this.sessionDuration);

    } catch (error) {
      global.logger?.error(`${account.username} session kurulum hatası`, { error: error.message });
    }
  }

  /**
   * Screenshot Alma Metodu
   * Login sonuçlarının görsel kanıtını saklar
   * 
   * @param {Object} page1 - Portal sayfası
   * @param {Object} page2 - Canvas sayfası
   * @param {Object} account - Hesap bilgileri
   * @param {boolean} portalSuccess - Portal başarılı mı?
   * @param {boolean} canvasSuccess - Canvas başarılı mı?
   */
  async takeScreenshots(page1, page2, account, portalSuccess, canvasSuccess) {
    try {
      const timestamp = Date.now();
      // Her iki sayfanın da screenshot'ını al (paralel)
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

  /**
   * Login Hatası Yönetimi
   * Başarısız login durumlarını handle eder
   * 
   * @param {Object} account - Hesap bilgileri
   * @param {Error} error - Hata objesi
   */
  async handleLoginFailure(account, error) {
    try {
      // Hata tipini belirle
      let errorType = 'general_error';
      let errorMessage = error.message;

      // Şifre yanlış hatası kontrolü
      if (error.message.includes('wrong') || 
          error.message.includes('yanlış') || 
          error.message.includes('verify your username or password') ||
          error.message.includes('Şifre veya kullanıcı adı yanlış')) {
        errorType = 'invalid_credentials';
        errorMessage = 'Şifre veya kullanıcı adı yanlış';
      }

      // Log kaydı oluştur
      await Log.create({
        username: account.username,
        status: 'failed',
        reason: `Maksimum deneme sayısına ulaşıldı: ${errorMessage}`
      });

      // Hesap durumunu güncelle
      await Account.findByIdAndUpdate(account._id, {
        status: 'failed',
        browserOpen: false,
        message: errorMessage
      });

      global.logger?.error(`❌ ${account.username} login tamamen başarısız - Browser kapatıldı`, { 
        error: errorMessage,
        errorType: errorType,
        maxRetries: this.maxRetries 
      });
    } catch (dbError) {
      global.logger?.error(`${account.username} hata kaydetme sorunu`, { error: dbError.message });
    }
  }

  /**
   * Session Süresi Güncelleme
   * Aktif session'ların süresini düzenli olarak günceller
   * 
   * @param {string} sessionId - Session ID
   */
  async updateSessionDuration(sessionId) {
    try {
      const session = await Session.findById(sessionId);
      if (session && session.isActive) {
        const now = new Date();
        const durationInMinutes = Math.floor((now - session.startTime) / 60000);
        
        // Session süresini güncelle
        await Session.findByIdAndUpdate(sessionId, {
          duration: durationInMinutes
        });
      }
    } catch (error) {
      global.logger?.error('Session süre güncelleme hatası', { error: error.message });
    }
  }

  /**
   * Session Kapatma Metodu
   * Belirli bir kullanıcının session'ını kapatır
   * 
   * @param {string} username - Kullanıcı adı
   */
  async endSession(username) {
    try {
      const activeSession = this.activeSessions.get(username);
      if (!activeSession) return;

      global.logger?.info(`⏰ ${username} oturumu kapatılıyor...`);

      // Interval'i temizle (memory leak önleme)
      if (activeSession.updateInterval) {
        clearInterval(activeSession.updateInterval);
      }

      // Browser context'i kapat
      if (activeSession.context) {
        try {
          await activeSession.context.close();
        } catch (error) {
          global.logger?.error(`${username} context kapatma hatası`, { error: error.message });
        }
      }

      // Session'ı veritabanında güncelle
      const now = new Date();
      const durationInMinutes = Math.floor((now - activeSession.startTime) / 60000);
      
      await Session.findByIdAndUpdate(activeSession.sessionId, {
        endTime: now,
        duration: durationInMinutes,
        isActive: false,
        status: 'completed'
      });

      // Hesap durumunu güncelle
      await Account.findOneAndUpdate(
        { username: username },
        { browserOpen: false, message: 'Oturum tamamlandı' }
      );

      // Aktif session'dan kaldır
      this.activeSessions.delete(username);

      global.logger?.success(`✅ ${username} oturumu başarıyla kapatıldı`, { 
        duration: durationInMinutes 
      });

    } catch (error) {
      global.logger?.error(`${username} oturum kapatma hatası`, { error: error.message });
    }
  }

  /**
   * Tüm Oturumları Kapatma
   * Tüm aktif session'ları ve browser'ı kapatır
   */
  async close() {
    try {
      global.logger?.info('🔄 Tüm oturumlar kapatılıyor...');
      
      // Health monitoring durdur
      await this.healthMonitor.stopHealthMonitoring();
      
      // Tüm aktif oturumları kapat
      const usernames = Array.from(this.activeSessions.keys());
      await Promise.all(usernames.map(username => this.endSession(username)));

      // Browser'ı kapat
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

  /**
   * Aktif Session Sayısını Döndür
   * @returns {number} Aktif session sayısı
   */
  getActiveSessionsCount() {
    return this.activeSessions.size;
  }

  /**
   * Aktif Kullanıcı Adlarını Döndür
   * @returns {Array<string>} Aktif kullanıcı adları listesi
   */
  getActiveUsernames() {
    return Array.from(this.activeSessions.keys());
  }

  /**
   * Health Monitor Durumunu Döndür
   * @returns {Object} Health monitor durumu
   */
  getHealthMonitorStatus() {
    return this.healthMonitor.getHealthStatus();
  }
}

// Singleton instance olarak export et
module.exports = new PlaywrightService(); 