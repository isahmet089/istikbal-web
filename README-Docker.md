# Web-oto Docker Deployment

Bu dokümantasyon, Web-oto projesini Ubuntu sunucunuzda Docker kullanarak nasıl deploy edeceğinizi açıklar.

## 🐳 Gereksinimler

- Ubuntu 18.04 veya üzeri
- Docker ve Docker Compose
- En az 2GB RAM
- En az 10GB disk alanı

## 🚀 Hızlı Başlangıç

### 1. Projeyi Sunucuya Kopyalayın

```bash
# Projeyi sunucunuza kopyalayın
git clone <your-repo-url>
cd web-oto
```

### 2. Environment Dosyasını Yapılandırın

```bash
# Environment dosyasını oluşturun
cp example.env .env

# .env dosyasını düzenleyin
nano .env
```

Gerekli environment değişkenleri:
- `TARGET_URL`: Otomasyon yapılacak hedef URL
- `ADMIN_USERNAME`: Admin paneli kullanıcı adı
- `ADMIN_PASSWORD`: Admin paneli şifresi

### 3. Otomatik Deployment

```bash
# Deploy script'ini çalıştırılabilir yapın
chmod +x deploy.sh

# Deployment'ı başlatın
./deploy.sh
```

### 4. Manuel Deployment

Eğer otomatik script kullanmak istemiyorsanız:

```bash
# Docker ve Docker Compose'u yükleyin
sudo apt update
sudo apt install -y docker.io docker-compose

# Docker servisini başlatın
sudo systemctl start docker
sudo systemctl enable docker

# Kullanıcıyı docker grubuna ekleyin
sudo usermod -aG docker $USER

# Yeni terminal oturumu açın veya şu komutu çalıştırın
newgrp docker

# Servisleri başlatın
docker-compose up -d
```

## 📊 Servis Yönetimi

### Servisleri Başlatma
```bash
docker-compose up -d
```

### Servisleri Durdurma
```bash
docker-compose down
```

### Logları Görüntüleme
```bash
# Tüm servislerin logları
docker-compose logs -f

# Sadece uygulama logları
docker-compose logs -f app

# Sadece MongoDB logları
docker-compose logs -f mongo
```

### Servis Durumunu Kontrol Etme
```bash
docker-compose ps
```

## 🔧 Production Deployment

Production ortamı için:

```bash
# Production compose dosyasını kullanın
docker-compose -f docker-compose.prod.yml up -d
```

### SSL Sertifikası Ekleme

1. SSL sertifikalarınızı `ssl/` klasörüne koyun
2. `nginx.conf` dosyasındaki SSL konfigürasyonunu aktif edin
3. Domain adınızı `nginx.conf` dosyasında güncelleyin

## 📁 Dosya Yapısı

```
web-oto/
├── Dockerfile                 # Docker imaj tanımı
├── docker-compose.yml         # Development compose
├── docker-compose.prod.yml    # Production compose
├── nginx.conf                 # Nginx konfigürasyonu
├── deploy.sh                  # Deployment script'i
├── .dockerignore             # Docker ignore dosyası
└── README-Docker.md          # Bu dosya
```

## 🔍 Sorun Giderme

### Port Çakışması
Eğer 3000 portu kullanımdaysa:
```bash
# docker-compose.yml dosyasında portu değiştirin
ports:
  - "3001:3000"  # Host port 3001, container port 3000
```

### MongoDB Bağlantı Hatası
```bash
# MongoDB container'ının durumunu kontrol edin
docker-compose logs mongo

# MongoDB'yi yeniden başlatın
docker-compose restart mongo
```

### Playwright Sorunları
```bash
# Playwright browser'larını yeniden yükleyin
docker-compose exec app npx playwright install chromium
```

## 📈 Monitoring

### Sistem Kaynakları
```bash
# Container kaynak kullanımını görüntüle
docker stats
```

### Disk Kullanımı
```bash
# Docker disk kullanımını kontrol et
docker system df
```

## 🧹 Temizlik

### Kullanılmayan Docker Kaynaklarını Temizleme
```bash
# Kullanılmayan container'ları sil
docker container prune

# Kullanılmayan imajları sil
docker image prune

# Kullanılmayan volume'ları sil
docker volume prune

# Tüm kullanılmayan kaynakları temizle
docker system prune -a
```

## 🔒 Güvenlik

- `.env` dosyasını asla git'e commit etmeyin
- Production'da güçlü şifreler kullanın
- Firewall kurallarını yapılandırın
- SSL sertifikası kullanın

## 📞 Destek

Sorun yaşarsanız:
1. Logları kontrol edin: `docker-compose logs`
2. Container durumunu kontrol edin: `docker-compose ps`
3. Sistem kaynaklarını kontrol edin: `docker stats` 

docker compose up -d --build --force-recreate  build et ve çalısştır
calıstır docker compose up -d