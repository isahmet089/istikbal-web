const fs = require('fs');
const csv = require('csv-parser');
const Account = require('../models/accountModel');

class CsvService {
  /**
   * Şifre Temizleme Metodu
   * Şifrenin sonundaki gereksiz karakterleri temizler
   * 
   * @param {string} password - Ham şifre
   * @returns {string} Temizlenmiş şifre
   */
  cleanPassword(password) {
    if (!password) return '';
    
    let cleanedPassword = password.trim();
    
    // Sadece başındaki ve sonundaki boşlukları kaldır
    // Şifrenin içindeki nokta, virgül ve diğer karakterleri koru
    cleanedPassword = cleanedPassword.replace(/^\s+|\s+$/g, '');
    
    return cleanedPassword;
  }

  /**
   * Kullanıcı Adı Temizleme Metodu
   * Kullanıcı adındaki gereksiz karakterleri temizler
   * 
   * @param {string} username - Ham kullanıcı adı
   * @returns {string} Temizlenmiş kullanıcı adı
   */
  cleanUsername(username) {
    if (!username) return '';
    
    let cleanedUsername = username.trim();
    
    // Sadece başındaki ve sonundaki boşlukları kaldır
    cleanedUsername = cleanedUsername.replace(/^\s+|\s+$/g, '');
    
    return cleanedUsername; // Email adresleri olduğu gibi kalacak
  }

  /**
   * Veri Doğrulama Metodu
   * Kullanıcı adı ve şifrenin geçerli olup olmadığını kontrol eder
   * 
   * @param {string} username - Kullanıcı adı
   * @param {string} password - Şifre
   * @returns {boolean} Veri geçerli mi?
   */
  validateData(username, password) {
    // Kullanıcı adı kontrolü
    if (!username || username.length < 5) {
      console.warn(`⚠️ Geçersiz kullanıcı adı: ${username}`);
      return false;
    }
    
    // Email formatı kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(username)) {
      console.warn(`⚠️ Geçersiz email formatı: ${username}`);
      return false;
    }
    
    // Şifre kontrolü
    if (!password || password.length < 3) {
      console.warn(`⚠️ Geçersiz şifre: ${password} (kullanıcı: ${username})`);
      return false;
    }
    
    return true;
  }

  async importAccounts(filePath) {
    const results = [];
    const errors = [];
    const cleaned = [];

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        // Sadece username ve password sütunlarını okur, fazlalıkları atar
        .pipe(csv(['username', 'password']))
        .on('data', (data) => {
          // Ham verileri al
          const rawUsername = data.username || '';
          const rawPassword = data.password || '';
          
          // Verileri temizle (sadece boşlukları kaldır)
          const username = this.cleanUsername(rawUsername);
          const password = this.cleanPassword(rawPassword);
          
          // Temizleme işlemi yapıldıysa logla
          if (rawUsername !== username || rawPassword !== password) {
            cleaned.push({
              original: { username: rawUsername, password: rawPassword },
              cleaned: { username, password }
            });
          }
          
          // Veri doğrulama
          if (this.validateData(username, password)) {
            results.push({ username, password });
          } else {
            errors.push({ username: rawUsername, password: rawPassword, reason: 'validation_failed' });
          }
        })
        .on('end', async () => {
          try {
            console.log(`📊 CSV İşleme Tamamlandı:`);
            console.log(`✅ Başarılı: ${results.length} hesap`);
            console.log(`❌ Hatalı: ${errors.length} hesap`);
            console.log(`🧹 Temizlenen: ${cleaned.length} veri`);
            
            // Temizlenen verileri göster
            if (cleaned.length > 0) {
              console.log('\n Temizlenen Veriler:');
              cleaned.forEach((item, index) => {
                console.log(`${index + 1}. ${item.original.username} | "${item.original.password}" → ${item.cleaned.username} | "${item.cleaned.password}"`);
              });
            }
            
            // Hatalı verileri göster
            if (errors.length > 0) {
              console.log('\n❌ Hatalı Veriler:');
              errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error.username} | "${error.password}"`);
              });
            }
            
            // Veritabanına kaydet
            for (const account of results) {
              await Account.findOneAndUpdate(
                { username: account.username },
                {
                  username: account.username,
                  password: account.password,
                  status: 'waiting',
                  browserOpen: false,
                  lastUpdated: new Date()
                },
                { upsert: true }
              );
            }
            
            resolve({
              success: true,
              imported: results.length,
              errors: errors.length,
              cleaned: cleaned.length,
              details: {
                cleaned: cleaned,
                errors: errors
              }
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => reject(error));
    });
  }
}

module.exports = new CsvService();
