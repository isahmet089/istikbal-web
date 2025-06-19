const { chromium } = require('playwright');
const Account = require('../models/accountModel');
const Log = require('../models/logModel');
const Session = require('../models/sessionModel');
const { randomDelay } = require('../utils/randomDelay');

class PlaywrightService {
  constructor() {
    this.browser = null;
    this.activeSessions = new Map();
  }

  async initialize() {
    try {
      console.log('Launching browser...');
      this.browser = await chromium.launch({ 
        headless: false,
        args: [
          '--start-maximized',
          '--disable-extensions',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ],
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      });
      console.log('Browser launched successfully');
      return true;
    } catch (error) {
      console.error('Failed to launch browser:', error);
      return false;
    }
  }

  async login(account) {
    if (!this.browser) {
      console.log('Browser not initialized, attempting to initialize...');
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize browser');
      }
    }

    try {
      console.log('Creating new browser context...');
      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/98.0.4758.102 Safari/537.36'
      });
      
      console.log('Creating new pages...');
      const page1 = await context.newPage(); // Student Portal
      const page2 = await context.newPage(); // Canvas Login
      
      // Navigate both pages simultaneously
      console.log('Navigating to both sites...');
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
      
      console.log('Both pages loaded');
      await randomDelay(2000, 4000);

      // Login to Student Portal (Page 1)
      console.log('Starting Student Portal login...');
      const portalSuccess = await this.loginToStudentPortal(page1, account);
      console.log('Student Portal login result:', portalSuccess);

      // Login to Canvas (Page 2)
      console.log('Starting Canvas login...');
      const canvasSuccess = await this.loginToCanvas(page2, account);
      console.log('Canvas login result:', canvasSuccess);

      // Determine overall status
      let overallStatus = 'failed';
      let message = '';
      
      if (portalSuccess && canvasSuccess) {
        overallStatus = 'success';
        message = 'Both sites logged in successfully';
      } else if (portalSuccess || canvasSuccess) {
        overallStatus = 'partial_failed';
        message = `Portal: ${portalSuccess ? 'Success' : 'Failed'}, Canvas: ${canvasSuccess ? 'Success' : 'Failed'}`;
      } else {
        overallStatus = 'failed';
        message = 'Both sites failed to login';
      }

      console.log('Overall login status:', overallStatus);

      // Take screenshots for debugging
      await Promise.all([
        page1.screenshot({ 
          path: `./screenshots/${account.username}-portal-${portalSuccess ? 'success' : 'failed'}-${Date.now()}.png`,
          fullPage: true 
        }),
        page2.screenshot({ 
          path: `./screenshots/${account.username}-canvas-${canvasSuccess ? 'success' : 'failed'}-${Date.now()}.png`,
          fullPage: true 
        })
      ]);

      // Update account status
      await Account.findByIdAndUpdate(account._id, {
        status: overallStatus,
        browserOpen: true,
        loginTime: new Date(),
        message: message
      });

      // Create new session if at least one login was successful
      if (portalSuccess || canvasSuccess) {
        const session = await Session.create({
          username: account.username,
          startTime: new Date(),
          status: 'active'
        });

        // Store session in memory for tracking
        this.activeSessions.set(account.username, {
          sessionId: session._id,
          startTime: new Date(),
          updateInterval: setInterval(async () => {
            const now = new Date();
            const durationInMinutes = Math.floor((now - session.startTime) / 60000);
            
            await Session.findByIdAndUpdate(session._id, {
              duration: durationInMinutes
            });
          }, 60000) // Update every minute
        });
      }

      // Log the event
      await Log.create({
        username: account.username,
        status: overallStatus,
        reason: message
      });

      // Keep session alive if at least one login was successful
      if (portalSuccess || canvasSuccess) {
        console.log('At least one login successful, keeping session alive...');
        setTimeout(async () => {
          try {
            await this.endSession(account.username);
            await context.close();
            await Account.findByIdAndUpdate(account._id, {
              browserOpen: false,
              message: 'Session ended'
            });
          } catch (error) {
            console.error('Error closing context:', error);
          }
        }, parseInt(process.env.SESSION_DURATION));
      } else {
        console.log('All logins failed, closing context...');
        await context.close();
      }

      return overallStatus === 'success';
    } catch (error) {
      console.error('Login error:', error);
      
      await Log.create({
        username: account.username,
        status: 'failed',
        reason: error.message
      });

      await Account.findByIdAndUpdate(account._id, {
        status: 'failed',
        browserOpen: false,
        message: error.message
      });

      return false;
    }
  }

  async loginToStudentPortal(page, account) {
    try {
      // Wait for the login form to be visible
      console.log('Waiting for Student Portal email form...');
      await page.waitForSelector('#emailForm', { 
        state: 'visible',
        timeout: 10000 
      });
      console.log('Found Student Portal email form field');

      // Fill username (email)
      console.log('Filling Student Portal username...');
      await page.fill('#emailForm', account.username);
      console.log('Filled Student Portal username:', account.username);
      await randomDelay(1000, 2000);

      // Fill password
      console.log('Filling Student Portal password...');
      await page.fill('#pwdform', account.password);
      console.log('Filled Student Portal password');
      await randomDelay(1000, 2000);

      // Click login button
      console.log('Clicking Student Portal login button...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('.btnlogin')
      ]);
      console.log('Clicked Student Portal login button');

      await randomDelay(5000, 8000);

      // Check for successful login
      const isSuccess = await page.evaluate(() => {
        const welcomeTitle = document.querySelector('h2.contentTitle');
        return welcomeTitle && welcomeTitle.textContent.includes('Welcome to AOL');
      });

      console.log('Student Portal login success:', isSuccess);
      return isSuccess;
    } catch (error) {
      console.error('Student Portal login error:', error);
      return false;
    }
  }

  async loginToCanvas(page, account) {
    try {
      // Wait for the login form to be visible
      console.log('Waiting for Canvas email form...');
      await page.waitForSelector('#pseudonym_session_unique_id', { 
        state: 'visible',
        timeout: 10000 
      });
      console.log('Found Canvas email form field');

      // Fill username (email)
      console.log('Filling Canvas username...');
      await page.fill('#pseudonym_session_unique_id', account.username);
      console.log('Filled Canvas username:', account.username);
      await randomDelay(1000, 2000);

      // Fill password
      console.log('Filling Canvas password...');
      await page.fill('#pseudonym_session_password', account.password);
      console.log('Filled Canvas password');
      await randomDelay(1000, 2000);

      // Click login button
      console.log('Clicking Canvas login button...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('input[type="submit"][value="Oturum Aç"]')
      ]);
      console.log('Clicked Canvas login button');

      await randomDelay(5000, 8000);

      // Check for successful login
      const isSuccess = await page.evaluate(() => {
        const dashboardText = document.querySelector('span.hidden-phone');
        return dashboardText && dashboardText.textContent.includes('Kontrol Paneli');
      });

      console.log('Canvas login success:', isSuccess);
      return isSuccess;
    } catch (error) {
      console.error('Canvas login error:', error);
      return false;
    }
  }

  async endSession(username) {
    const activeSession = this.activeSessions.get(username);
    if (activeSession) {
      clearInterval(activeSession.updateInterval);
      const now = new Date();
      const durationInMinutes = Math.floor((now - activeSession.startTime) / 60000);
      
      await Session.findByIdAndUpdate(activeSession.sessionId, {
        endTime: now,
        duration: durationInMinutes,
        isActive: false,
        status: 'completed'
      });

      this.activeSessions.delete(username);
    }
  }

  async close() {
    try {
      // End all active sessions
      for (const username of this.activeSessions.keys()) {
        await this.endSession(username);
      }

      if (this.browser) {
        console.log('Closing browser...');
        await this.browser.close();
        this.browser = null;
        console.log('Browser closed successfully');
      }
    } catch (error) {
      console.error('Error closing browser:', error);
    }
  }
}

module.exports = new PlaywrightService(); 