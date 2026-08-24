# Primadev Digital Technology

[![Website](https://img.shields.io/badge/Website-primadev.id-0070f3?style=flat-square&logo=vercel)](https://primadev.id)
[![Frontend](<https://img.shields.io/badge/Frontend-Vanilla%20JS%20%7C%20Bootstrap%205.3-7952b3?style=flat-square&logo=bootstrap>)](https://getbootstrap.com)
[![Backend](<https://img.shields.io/badge/Backend-Vercel%20Serverless%20Node.js-black?style=flat-square&logo=vercel>)](https://vercel.com)
[![Database](<https://img.shields.io/badge/Database-Firebase%20RTDB%20%7C%20Supabase-FFA611?style=flat-square&logo=firebase>)](https://firebase.google.com)
[![Payment](<https://img.shields.io/badge/Payment-Midtrans%20%7C%20Xendit-0052cc?style=flat-square>)](https://xendit.co)

**Primadev Digital Technology** adalah platform solusi digital terpadu untuk penyediaan dan pengelolaan software bisnis premium yang aman, legal, otomatis, dan efisien. Mengintegrasikan otomasi lisensi real-time, multi-payment gateway, invoice otomatis, portal karir, sistem presensi/manajemen karyawan (Employer Portal), serta panel Admin Dashboard komprehensif.

---

## Fitur Utama

- **Automated Digital Storefront & Catalog**: Katalog produk software & lisensi dengan sistem pemesanan instan 24/7.
- **Multi-Payment Gateway Integration**:
  - Didukung integrasi **Xendit** dan **Midtrans**.
  - Metode pembayaran lengkap: QRIS (ShopeePay, GoPay, Dana, OVO, LinkAja), Virtual Account (BCA, Mandiri, BNI, BRI, Permata), E-Wallet, dan Kartu Kredit.
- **Real-time License Generator & Validator**:
  - Kunci lisensi software di-generate dan divalidasi secara real-time langsung melalui backend serverless & database.
  - Endpoint validasi lisensi untuk aplikasi klien (`/api/validate-license`).
- **Automated PDF Invoice & Email Delivery**:
  - Pembuatan invoice PDF otomatis menggunakan **PDFKit**.
  - Notifikasi konfirmasi dan pengiriman lisensi/invoice langsung ke email pelanggan via **Nodemailer (SMTP)**.
- **Webhook Notification Engine**:
  - Sinkronisasi status transaksi otomatis dari callback payment gateway (Midtrans & Xendit).
  - Aktivasi otomatis saat pembayaran sukses diterima.
- **Admin Dashboard Sakral**:
  - Panel kontrol terpusat untuk mengelola katalog produk/aplikasi, kunci lisensi, status transaksi, lowongan kerja, dan manajemen karyawan.
- **Employer & Employee Management Portal**:
  - Portal manajemen karyawan internal, surat tugas, presensi, absensi, dan penugasan tim.
- **Career & Recruitment Portal**:
  - Halaman lowongan kerja terbuka (`vacancies.html`), sistem formulir pendaftaran kerja, dan pelacakan status lamaran.
- **Custom Order & License Renewal**:
  - Pemesanan software kustom sesuai kebutuhan bisnis (`custom-order.html`).
  - Fitur perpanjangan masa aktif lisensi (`renew.html`).
- **Modern Responsive UI**:
  - Antarmuka modern dengan styling Glassmorphism, Micro-animations, dark mode support, dan responsif untuk mobile, tablet, dan desktop.

---

## Stack Teknologi

| Layer                          | Teknologi / Library                                                        |
| ------------------------------ | -------------------------------------------------------------------------- |
| **Frontend**             | HTML5, Vanilla JavaScript (ES6+), Bootstrap 5.3, SweetAlert2, Lucide Icons |
| **Backend**              | Vercel Serverless Functions (Node.js)                                      |
| **Database**             | Firebase Realtime Database & Supabase                                      |
| **Payment Gateway**      | Xendit API & Midtrans Snap / Core API                                      |
| **Email Service**        | Nodemailer (Gmail SMTP) & EmailJS                                          |
| **Document / PDF**       | PDFKit                                                                     |
| **Analytics**            | Vercel Analytics & Vercel Speed Insights                                   |
| **Deployment / Hosting** | Vercel                                                                     |

---

## 📂 Struktur Direktori Proyek

```text
Primadev-App/
├── api/                                # Vercel Serverless Functions (Backend API)
│   ├── apps.js                         # API CRUD katalog aplikasi
│   ├── employees.js                    # API manajemen data karyawan & presensi
│   ├── get-config.js                   # API config provider client-side (Firebase/Supabase)
│   ├── invoice.js                      # API generator invoice PDF (PDFKit)
│   ├── licenses.js                     # API manajemen kunci lisensi
│   ├── public_order.js                 # API inisiasi order & payment gateway (Xendit/Midtrans)
│   ├── signature.js                    # API tanda tangan digital & verifikasi dokumen
│   ├── vacancies.js                    # API lowongan kerja karir
│   ├── validate-license.js             # API validasi status lisensi untuk client app
│   └── webhook.js                      # Webhook handler notifikasi pembayaran (Xendit & Midtrans)
├── app/                                # Halaman Aplikasi Web
│   ├── admin.html                      # Halaman Login Admin
│   ├── admin-dashboard.html            # Dashboard Kontrol Terpusat Admin
│   ├── career.html                     # Portal Karir Utama
│   ├── career-success.html             # Halaman Konfirmasi Sukses Melamar
│   ├── checkout.html                   # Halaman Pembayaran / Checkout
│   ├── custom-order.html               # Halaman Form Pemesanan Custom Software
│   ├── employer.html                   # Portal Manajemen Karyawan / HR
│   ├── product-detail.html             # Halaman Detail Produk & Paket Lisensi
│   ├── renew.html                      # Halaman Perpanjangan Lisensi
│   ├── store.html                      # Toko Aplikasi Digital (Storefront)
│   ├── support.html                    # Pusat Bantuan & Kontak Dukungan
│   ├── thankyou.html                   # Halaman Sukses Transaksi & Detail Lisensi
│   ├── vacancies.html                  # Daftar Lowongan Pekerjaan
│   ├── waiting-payment.html            # Halaman Menunggu Pembayaran & Petunjuk Bayar
│   └── legal/                          # Dokumen Legalitas & Kebijakan
│       ├── kebijakan-privasi.html      # Kebijakan Privasi
│       ├── penafian.html               # Penafian (Disclaimer)
│       └── syarat-ketentuan.html       # Syarat & Ketentuan Layanan
├── public/                             # Aset Statis (Logo, Gambar, Ikon)
├── utils/                              # Utility Helper Backend
│   └── email_template.js               # Template Email Transaksional HTML
├── index.html                          # Landing Page Utama Primadev
├── vercel.json                         # Konfigurasi Routing & Serverless Vercel
├── package.json                        # Definisi Dependensi & Metadata Proyek
└── README.md                           # Dokumentasi Proyek
```

---

## Panduan Instalasi & Menjalankan Lokal

### 1. Clone Repository

```bash
git clone https://github.com/iamwisnu99/Primadev-App.git
cd Primadev-App
```

### 2. Instal Dependensi

```bash
npm install
```

### 3. Konfigurasi Environment Variables

Salin atau buat file `.env` di direktori root proyek dan sesuaikan nilai variabel berikut:

```env
# ==========================================
# FIREBASE ADMIN SDK (Backend Service Account)
# ==========================================
FIREBASE_DATABASE_URL="https://your-project-default-rtdb.firebaseio.com"
FIREBASE_PROJECT_ID="your_firebase_project_id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"

# (Alternatif: stringified service account JSON)
# FIREBASE_SERVICE_ACCOUNT='{"project_id":"...","client_email":"...","private_key":"..."}'

# ==========================================
# FIREBASE CLIENT CONFIG (Public via /api/get-config)
# ==========================================
FIREBASE_API_KEY="your_firebase_api_key"
FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
FIREBASE_MESSAGING_SENDER_ID="your_messaging_sender_id"
FIREBASE_APP_ID="your_firebase_app_id"

# ==========================================
# SUPABASE CONFIG
# ==========================================
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your_supabase_anon_key"
SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"

# ==========================================
# PAYMENT GATEWAY - XENDIT
# ==========================================
XENDIT_SECRET_KEY="xnd_development_..."
XENDIT_PUBLIC_KEY="xnd_public_development_..."
XENDIT_CALLBACK_TOKEN="your_xendit_webhook_verification_token"

# ==========================================
# PAYMENT GATEWAY - MIDTRANS
# ==========================================
MIDTRANS_SERVER_KEY="SB-Mid-server-..."
MIDTRANS_CLIENT_KEY="SB-Mid-client-..."
MIDTRANS_IS_PRODUCTION=false

# ==========================================
# EMAIL NOTIFICATION (Nodemailer / Gmail SMTP)
# ==========================================
EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-google-app-password"

# ==========================================
# SECURITY & APP ORIGINS
# ==========================================
ADMIN_SECRET="your_admin_secret_token"
ALLOWED_ORIGIN="http://localhost:3000"
PUBLIC_ORIGIN_URL="http://localhost:3000"
```

### 4. Menjalankan Server Development Lokal

Gunakan [Vercel CLI](https://vercel.com/docs/cli) untuk menjalankan frontend statis bersama serverless functions secara lokal:

```bash
# Menggunakan Vercel CLI global atau npx
npx vercel dev
```

Aplikasi akan berjalan di `http://localhost:3000`.

---

## Keamanan & Kebijakan

- Kredensial sensitif (`.env`, private keys, secret tokens) tidak boleh diunggah ke repository publik.
- File-file konfigurasi lokal dan cache build (`.vercel`, `node_modules/`) sudah diabaikan melalui `.gitignore`.

---

## Lisensi

Proyek ini dilindungi hak cipta oleh **Primadev Digital Technology**. Penggunaan source code ini untuk tujuan komersial tanpa izin tertulis dari pemilik hak cipta dilarang. Lihat file [LICENSE](./LICENSE) untuk informasi lebih lanjut.

## Kontak & Dukungan

- **Founder & Developer**: Prima Wisnu Abror Azmi
- **Email**: [support.primadev@gmail.com](mailto:support.primadev@gmail.com)
- **Website**: [primadev.id](https://primadev.id)

---

*Primadev Digital Technology — Innovate, Automate, Elevate.*
