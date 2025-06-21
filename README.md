# Web Oto - Takvim Görünümü

Bu proje, Node.js (Express), EJS şablon motoru ve MongoDB kullanılarak geliştirilmiş bir web otomasyon projesidir. Kullanıcıların günlük oturum sürelerini Google Takvim benzeri bir çizelge ile görüntüleyebilirsiniz.

## Özellikler

### 🗓️ Takvim Görünümü
- **FullCalendar.js** ile modern takvim arayüzü
- Haftalık ve aylık görünüm seçenekleri
- Türkçe dil desteği
- Responsive tasarım

### 📊 Günlük Oturum Takibi
- Her gün için toplam aktif süre gösterimi
- Renk kodlaması:
  - 🟢 **Yeşil**: 4+ saat (Yüksek aktivite)
  - 🟡 **Sarı**: 2-4 saat (Orta aktivite)
  - 🔴 **Kırmızı**: 2 saatten az (Düşük aktivite)

### 🔍 Detaylı Görünüm
- Günlük kutucuklara tıklayarak oturum detayları
- Modal pencerede oturum listesi
- Başlangıç, bitiş, süre ve durum bilgileri

### 🚀 API Endpoints
- `GET /calendar/:username` - Takvim sayfası
- `GET /calendar/api/:username` - Takvim verileri (AJAX)
- `GET /calendar/api/:username/day/:date` - Günlük detaylar

## Kurulum

### Gereksinimler
- Node.js (v14 veya üzeri)
- MongoDB
- npm veya yarn

### Adımlar

1. **Projeyi klonlayın**
```bash
git clone <repository-url>
cd web-oto
```

2. **Bağımlılıkları yükleyin**
```bash
npm install
```

3. **Çevre değişkenlerini ayarlayın**
```bash
cp example.env .env
```
`.env` dosyasını düzenleyerek MongoDB bağlantı bilgilerinizi girin.

4. **Uygulamayı başlatın**
```bash
npm start
```

## Kullanım

### Dashboard
- Ana sayfa: `http://localhost:3000`
- Kullanıcı hesaplarını görüntüleme
- Otomasyon başlatma/durdurma
- Takvim görünümüne erişim

### Takvim Görünümü
- Kullanıcı takvimi: `http://localhost:3000/calendar/:username`
- Örnek: `http://localhost:3000/calendar/kullanici_adi`

### Veritabanı Verileri
Sistem, MongoDB'deki `sessions` koleksiyonundaki mevcut verileri kullanır:
- `username`: Kullanıcı adı
- `startTime`: Oturum başlangıç zamanı
- `endTime`: Oturum bitiş zamanı
- `duration`: Oturum süresi (dakika)
- `status`: Oturum durumu

## Teknik Detaylar

### Mimari
- **MVC Pattern**: Model-View-Controller yapısı
- **Express.js**: Web framework
- **EJS**: Template engine
- **MongoDB**: Veritabanı
- **Mongoose**: ODM (Object Document Mapper)

### Veritabanı Şeması
```javascript
// Session Model
{
  username: String,
  date: Date,
  startTime: Date,
  endTime: Date,
  duration: Number, // dakika cinsinden
  status: String, // 'active', 'completed', 'interrupted'
  isActive: Boolean
}
```

### API Response Formatları

#### Takvim Verileri
```json
{
  "success": true,
  "events": [
    {
      "id": "2024-01-15",
      "title": "3.5 saat",
      "start": "2024-01-15",
      "backgroundColor": "#28a745",
      "extendedProps": {
        "totalHours": 3.5,
        "sessionCount": 2,
        "sessions": [...]
      }
    }
  ]
}
```

#### Günlük Detaylar
```json
{
  "success": true,
  "date": "2024-01-15",
  "totalHours": 3.5,
  "totalDuration": 210,
  "sessions": [
    {
      "id": "...",
      "startTime": "2024-01-15T09:00:00Z",
      "endTime": "2024-01-15T11:30:00Z",
      "duration": 150,
      "status": "completed"
    }
  ]
}
```

## Özelleştirme

### Renk Kodlaması
`controllers/calendarController.js` dosyasında renk eşikleri değiştirilebilir:
```javascript
// Renk belirleme
let color = '#dc3545'; // Kırmızı (2 saatten az)
if (totalHours >= 4) {
  color = '#28a745'; // Yeşil (4 saatten fazla)
} else if (totalHours >= 2) {
  color = '#ffc107'; // Sarı (2-4 saat arası)
}
```

### Takvim Görünümü
`public/js/calendar.js` dosyasında FullCalendar ayarları değiştirilebilir:
```javascript
const calendar = new FullCalendar.Calendar(calendarEl, {
  initialView: 'dayGridMonth', // 'dayGridWeek' için haftalık
  locale: 'tr',
  // ... diğer ayarlar
});
```

## Geliştirme

### Geliştirme Modu
```bash
npm run dev
```

### Yeni Özellik Ekleme
1. Controller'da yeni fonksiyon ekleyin
2. Route tanımlayın
3. View template'i oluşturun
4. Gerekirse CSS/JS dosyalarını güncelleyin

## Hata Ayıklama

### Tarih Hataları
Sistem, veritabanındaki geçersiz tarih verilerini otomatik olarak filtreler ve uyarı verir. Eğer tarih hataları görüyorsanız:
1. MongoDB'deki `sessions` koleksiyonunu kontrol edin
2. `startTime` alanlarının geçerli tarih formatında olduğundan emin olun
3. Konsol loglarını kontrol edin

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## Destek

Herhangi bir sorun yaşarsanız, lütfen GitHub Issues bölümünde bildirin. 