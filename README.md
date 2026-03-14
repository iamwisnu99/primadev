# PrimaDev Digital Technology

[![Netlify Status](https://api.netlify.com/api/v1/badges/88f0f9b0-35e8-4888-a3e5-195c2175c6be/deploy-status)](https://app.netlify.com/projects/apps-primadev/deploys)
[![Tech](https://img.shields.io/badge/Tech-VanillaJS%20%7C%20Bootstrap%205-blueviolet)](https://apps-apps-primadev.netlify.app)
[![Backend](https://img.shields.io/badge/Backend-Netlify%20Functions-00C7B7)](https://www.netlify.com/products/functions/)

**PrimaDev Digital Technology** adalah platform solusi digital terpadu yang dirancang untuk mempermudah operasional bisnis melalui software premium yang aman, legal, dan terefisiensi. Kami menggabungkan keahlian manusia dengan teknologi kecerdasan buatan untuk menghadirkan produk digital berkualitas tinggi.

---

## Fitur Utama

- **Automated Storefront**: Pembelian lisensi software secara otomatis dengan aktivasi instan 24/7.
- **Admin Dashboard Sakral**: Panel kontrol komprehensif untuk manajemen lisensi, aplikasi, dan pemantauan transaksi.
- **Sistem Lisensi Real-time**: Pengelolaan kunci lisensi yang terintegrasi langsung dengan database.
- **Payment Gateway Integration**: Didukung oleh **Midtrans** untuk transaksi yang aman dan beragam metode pembayaran (QRIS, VA, E-Wallet).
- **Customer Service Panel**: Sistem komunikasi terintegrasi untuk membantu kendala pengguna secara cepat.
- **Responsive Design**: Tampilan modern yang dioptimalkan untuk berbagai perangkat (Desktop, Tablet, Mobile).

## Stack Teknologi

| Komponen | Teknologi |
|----------|-----------|
| **Frontend** | HTML5, Vanilla JavaScript, Bootstrap 5.3, SweetAlert2 |
| **Backend** | Netlify Functions (Node.js) |
| **Database** | Firebase Realtime Database & Supabase |
| **Payments** | Midtrans Core API |
| **Styling** | Custom CSS3 with Glassmorphism & Micro-animations |
| **Hosting** | Netlify |

## 📂 Struktur Proyek

```bash
├── admin.html          # Panel Dashboard Admin
├── index.html          # Halaman Utama (Landing Page)
├── store.html          # Toko Aplikasi Digital
├── support.html        # Halaman Layanan Bantuan
├── legal.html          # Dokumen Syarat & Ketentuan
├── netlify/
│   └── functions/      # Serverless Backend Logic
├── public/             # Aset Statis (Logo, Favicon)
└── package.json        # Dependensi Project
```

## Instalasi Lokal

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/iamwisnu99/Primadev-App.git
   ```

2. **Instal dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment:**
   Buat file `.env` di root directory dan masukkan kredensial yang diperlukan sesuai template berikut:
   ```env
   # Firebase Config
   FIREBASE_DATABASE_URL=
   FIREBASE_PROJECT_ID=
   FIREBASE_CLIENT_EMAIL=
   FIREBASE_PRIVATE_KEY=
   FIREBASE_API_KEY=
   FIREBASE_AUTH_DOMAIN=

   # Midtrans Config
   MIDTRANS_SERVER_KEY=
   MIDTRANS_CLIENT_KEY=
   MIDTRANS_IS_PRODUCTION=false

   # EmailJS Config (Opsional untuk Notifikasi)
   EMAILJS_SERVICE_ID=
   EMAILJS_TEMPLATE_ID=
   EMAILJS_PUBLIC_KEY=
   ```

4. **Jalankan Netlify Dev:**
   ```bash
   netlify dev
   ```

---

## Lisensi

Proyek ini dilindungi hak cipta oleh **PT. PrimaDev Digital Technology**. Penggunaan source code ini untuk tujuan komersial tanpa izin tertulis adalah dilarang. Lihat file [LICENSE](./LICENSE) untuk detail lebih lanjut.

## Kontak

- **Owner**: Wisnu
- **Email**: [wisnu.bussines99@gmail.com](mailto:wisnu.bussines99@gmail.com)
- **Website**: [apps-primadev.netlify.app](https://apps-apps-primadev.netlify.app)

---
*I Love You, No.*
*We Love You. Yes.*
