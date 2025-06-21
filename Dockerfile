# Node.js 18 Alpine imajını kullan
FROM node:18-alpine

# Çalışma dizinini belirle
WORKDIR /app

# Playwright için gerekli bağımlılıkları yükle
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Playwright için environment variable'ları ayarla
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Package.json ve package-lock.json dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm ci --only=production

# Uygulama dosyalarını kopyala
COPY . .

# Logs dizinini oluştur
RUN mkdir -p logs

# Port 3000'i expose et
EXPOSE 3000

# Uygulamayı başlat
CMD ["npm", "start"] 