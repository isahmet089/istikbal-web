#!/bin/bash

# Web-oto deployment script for Ubuntu server

echo "🚀 Starting Web-oto deployment..."

# Gerekli paketleri yükle
echo "📦 Installing required packages..."
sudo apt update
sudo apt install -y docker.io docker-compose curl

# Docker servisini başlat
echo "🐳 Starting Docker service..."
sudo systemctl start docker
sudo systemctl enable docker

# Kullanıcıyı docker grubuna ekle (opsiyonel)
sudo usermod -aG docker $USER

# Environment dosyasını oluştur
echo "⚙️ Creating environment file..."
if [ ! -f .env ]; then
    cp example.env .env
    echo "✅ Environment file created from example.env"
    echo "⚠️  Please edit .env file with your configuration"
else
    echo "✅ Environment file already exists"
fi

# Docker imajlarını build et
echo "🔨 Building Docker images..."
docker-compose build

# Servisleri başlat
echo "🚀 Starting services..."
docker-compose up -d

# Servislerin durumunu kontrol et
echo "📊 Checking service status..."
docker-compose ps

echo "✅ Deployment completed!"
echo "🌐 Application should be available at: http://your-server-ip:3000"
echo "📝 To view logs: docker-compose logs -f"
echo "🛑 To stop services: docker-compose down" 