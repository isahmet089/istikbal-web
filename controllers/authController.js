class AuthController {
  async login(req, res) {
    try {
      const { username, password } = req.body;
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      if (username !== adminUsername || password !== adminPassword) {
        return res.render('login', { error: 'Geçersiz kullanıcı adı veya şifre', username });
      }
      req.session.isAuthenticated = true;
      req.session.username = username;
      req.session.loginTime = new Date();
      res.redirect('/');
    } catch (error) {
      res.render('login', { error: 'Giriş sırasında hata oluştu', username: req.body.username });
    }
  }

  async logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      res.redirect('/login');
    });
  }

  async showLogin(req, res) {
    res.render('login', { error: null, username: '' });
  }
}

module.exports = new AuthController(); 