# Primadev Digital Technology

[![Tech](<https://img.shields.io/badge/Tech-VanillaJS%20%7C%20Bootstrap%205-blueviolet>)](https://primadev.id)
[![Backend](<https://img.shields.io/badge/Backend-Vercel%20Serverless%20Functions-000000>)](https://vercel.com/docs/functions)

**PT Primadev Digital Technology** adalah platform solusi digital terpadu yang dirancang untuk mempermudah operasional bisnis melalui software premium yang aman, legal, dan terefisiensi. Kami menggabungkan keahlian manusia dengan teknologi kecerdasan buatan untuk menghadirkan produk digital berkualitas tinggi.

---

## Fitur Utama

- **Automated Storefront**: Pembelian lisensi software secara otomatis dengan aktivasi instan 24/7.
- **Admin Dashboard Sakral**: Panel kontrol komprehensif untuk manajemen lisensi, aplikasi, dan pemantauan transaksi.
- **Sistem Lisensi Real-time**: Pengelolaan kunci lisensi yang terintegrasi langsung dengan database.
- **Payment Gateway Integration**: Didukung oleh **Xendit** untuk transaksi yang aman dan beragam metode pembayaran (QRIS, VA, E-Wallet).
- **Portal Karir**: Platform pencarian kerja dan portal pendaftaran bagi calon karyawan.
- **Responsive Design**: Tampilan modern yang dioptimalkan untuk berbagai perangkat (Desktop, Tablet, Mobile).

## Stack Teknologi

| Komponen           | Teknologi                                             |
| ------------------ | ----------------------------------------------------- |
| **Frontend** | HTML5, Vanilla JavaScript, Bootstrap 5.3, SweetAlert2 |
| **Backend**  | Vercel Serverless Functions (Node.js)                 |
| **Database** | Firebase Realtime Database & Supabase                 |
| **Payments** | Xendit Payments API (Custom UI)                       |
| **Styling**  | Custom CSS3 with Glassmorphism & Micro-animations     |
| **Hosting**  | Vercel                                                |

## 📂 Struktur Proyek

```bash
├── index.html          # Halaman Utama (Landing Page)
├── app/                # Direktori Halaman Aplikasi
│   ├── admin.html           # Login Admin
│   ├── admin-dashboard.html # Panel Dashboard Admin
│   ├── career.html          # Halaman Karir Utama
│   ├── career-success.html  # Halaman Sukses Melamar
│   ├── checkout.html        # Halaman Checkout
│   ├── custom-order.html    # Halaman Pesanan Custom
│   ├── employer.html        # Halaman Untuk Perusahaan
│   ├── product-detail.html  # Halaman Detail Produk
│   ├── renew.html           # Halaman Perpanjang Layanan
│   ├── store.html           # Toko Aplikasi Digital
│   ├── support.html         # Halaman Layanan Bantuan
│   ├── thankyou.html        # Halaman Terima Kasih
│   ├── vacancies.html       # Halaman Lowongan Pekerjaan
│   ├── waiting-payment.html # Halaman Menunggu Pembayaran
│   └── legal/               # Dokumen Legalitas
│       ├── kebijakan-privasi.html
│       ├── penafian.html
│       └── syarat-ketentuan.html
├── api/                # Vercel Serverless Backend Logic (API)
├── public/             # Aset Statis (Logo, Ikon, Background)
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
   # Firebase Backend/Admin Config
   FIREBASE_DATABASE_URL="your_key"
   FIREBASE_PROJECT_ID="your_key"
   FIREBASE_CLIENT_EMAIL="your_key"
   FIREBASE_PRIVATE_KEY="your_key"

   # Firebase Client Config (Public)
   FIREBASE_API_KEY="your_key"
   FIREBASE_AUTH_DOMAIN="your_key"
   FIREBASE_STORAGE_BUCKET="your_key"
   FIREBASE_MESSAGING_SENDER_ID="your_key"
   FIREBASE_APP_ID="your_key"

   # Email JS Configuration
   EMAILJS_SERVICE_ID="your_key"
   EMAILJS_TEMPLATE_ID="your_key"
   EMAILJS_PRIVATE_KEY="your_key"
   EMAILJS_PUBLIC_KEY="your_key"

   # Xendit Configuration
   XENDIT_SECRET_KEY=your_key
   XENDIT_PUBLIC_KEY=your_key
   XENDIT_CALLBACK_TOKEN=your_key

   # Origin
   ALLOWED_ORIGIN=localhost:3000
   ```
4. **Jalankan Vercel Dev:**

   ```bash
   vercel
   ```

---

## Lisensi

Proyek ini dilindungi hak cipta oleh **PT Primadev Digital Technology**. Penggunaan source code ini untuk tujuan komersial tanpa izin tertulis adalah dilarang. Lihat file [LICENSE](./LICENSE) untuk detail lebih lanjut.

## Kontak

- **Owner**: Prima Wisnu Abror Azmi
- **Email**: [support.primadev@gmail.com](mailto:support.primadev@gmail.com)
- **Website**: [primadev.id](https://primadev.id)

---

*I Love You, No.*
*We Love You. Yes.*
