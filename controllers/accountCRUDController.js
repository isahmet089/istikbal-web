const Account = require('../models/accountModel');

class AccountCRUDController {
  // Tüm hesapları getir
  async getAllAccounts(req, res) {
    try {
      const accounts = await Account.find().sort('-lastUpdated');
      res.json({ success: true, accounts });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Tek hesap getir
  async getAccountById(req, res) {
    try {
      const account = await Account.findById(req.params.id);
      if (!account) {
        return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
      }
      res.json({ success: true, account });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Yeni hesap oluştur
  async createAccount(req, res) {
    try {
      const { username, password, status } = req.body;

      // Gerekli alanları kontrol et
      if (!username || !password) {
        return res.status(400).json({ 
          success: false, 
          error: 'Kullanıcı adı ve şifre zorunludur' 
        });
      }

      // Kullanıcı adı benzersizlik kontrolü
      const existingAccount = await Account.findOne({ username });

      if (existingAccount) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bu kullanıcı adı zaten kullanılıyor' 
        });
      }

      const account = new Account({
        username,
        password,
        status: status || 'waiting'
      });

      await account.save();
      res.status(201).json({ success: true, account });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Hesap güncelle
  async updateAccount(req, res) {
    try {
      const { username, password, status, message } = req.body;
      const accountId = req.params.id;

      const account = await Account.findById(accountId);
      if (!account) {
        return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
      }

      // Benzersizlik kontrolü (kendi ID'si hariç)
      if (username) {
        const existingAccount = await Account.findOne({
          username,
          _id: { $ne: accountId }
        });

        if (existingAccount) {
          return res.status(400).json({ 
            success: false, 
            error: 'Bu kullanıcı adı zaten kullanılıyor' 
          });
        }
      }

      // Güncelleme
      const updateData = {};
      if (username) updateData.username = username;
      if (password) updateData.password = password;
      if (status) updateData.status = status;
      if (message !== undefined) updateData.message = message;
      updateData.lastUpdated = new Date();

      const updatedAccount = await Account.findByIdAndUpdate(
        accountId,
        updateData,
        { new: true, runValidators: true }
      );

      res.json({ success: true, account: updatedAccount });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Hesap sil
  async deleteAccount(req, res) {
    try {
      const account = await Account.findByIdAndDelete(req.params.id);
      if (!account) {
        return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
      }
      res.json({ success: true, message: 'Hesap başarıyla silindi' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Hesap durumunu değiştir
  async toggleAccountStatus(req, res) {
    try {
      const account = await Account.findById(req.params.id);
      if (!account) {
        return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
      }

      // Durum döngüsü: waiting -> success -> failed -> waiting
      const statusCycle = ['waiting', 'success', 'failed', 'partial_failed'];
      const currentIndex = statusCycle.indexOf(account.status);
      const nextIndex = (currentIndex + 1) % statusCycle.length;
      const newStatus = statusCycle[nextIndex];

      account.status = newStatus;
      account.lastUpdated = new Date();
      await account.save();

      res.json({ success: true, account });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Browser durumunu değiştir
  async toggleBrowserStatus(req, res) {
    try {
      const account = await Account.findById(req.params.id);
      if (!account) {
        return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
      }

      account.browserOpen = !account.browserOpen;
      account.lastUpdated = new Date();
      await account.save();

      res.json({ success: true, account });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Hesap arama
  async searchAccounts(req, res) {
    try {
      const { q, status, browserOpen } = req.query;
      let query = {};

      // Arama terimi
      if (q) {
        query.username = { $regex: q, $options: 'i' };
      }

      // Durum filtresi
      if (status) {
        query.status = status;
      }

      // Browser durumu filtresi
      if (browserOpen !== undefined) {
        query.browserOpen = browserOpen === 'true';
      }

      const accounts = await Account.find(query).sort('-lastUpdated');
      res.json({ success: true, accounts });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Toplu işlemler
  async bulkUpdateStatus(req, res) {
    try {
      const { accountIds, status, message } = req.body;

      if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Geçerli hesap ID\'leri gerekli' 
        });
      }

      const updateData = { lastUpdated: new Date() };
      if (status) updateData.status = status;
      if (message !== undefined) updateData.message = message;

      const result = await Account.updateMany(
        { _id: { $in: accountIds } },
        updateData
      );

      res.json({ 
        success: true, 
        message: `${result.modifiedCount} hesap güncellendi`,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async bulkDelete(req, res) {
    try {
      const { accountIds } = req.body;

      if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Geçerli hesap ID\'leri gerekli' 
        });
      }

      const result = await Account.deleteMany({ _id: { $in: accountIds } });

      res.json({ 
        success: true, 
        message: `${result.deletedCount} hesap silindi`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new AccountCRUDController(); 