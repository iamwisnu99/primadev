/**
 * ============================================================
 * Netlify Function: validate-license
 * Endpoint: /.netlify/functions/validate-license
 * Method  : POST (validasi) | OPTIONS (CORS preflight)
 *
 * Tujuan  : Validasi license key browser extension Primadev.
 *           Dipanggil langsung oleh browser extension saat
 *           pengguna mengisi form aktivasi.
 *
 * Dibuat  : 2026-07-23
 * Versi   : 1.0.0
 * ============================================================
 */

const admin = require('firebase-admin');

// ============================================================
// INIT FIREBASE ADMIN (singleton — aman di Netlify cold start)
// ============================================================
if (!admin.apps.length) {
    let serviceAccount = null;
    try {
        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
            };
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            serviceAccount = {
                projectId: raw.project_id,
                clientEmail: raw.client_email,
                privateKey: raw.private_key.replace(/\\n/g, '\n')
            };
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: process.env.FIREBASE_DATABASE_URL ||
                    'https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app'
            });
        }
    } catch (err) {
        console.error('[validate-license] Firebase init error:', err.message);
    }
}

// ============================================================
// CORS HEADERS
// Dibuat terbuka (*) karena dipanggil dari browser extension.
// Browser extension tidak memiliki origin seperti website biasa.
// ============================================================
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// ============================================================
// HELPER: Buat response JSON standar
// ============================================================
const respond = (statusCode, body) => ({
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
});

// ============================================================
// MAIN HANDLER
// ============================================================
exports.handler = async (event) => {

    // --- CORS Preflight ---
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    // --- Hanya terima POST ---
    if (event.httpMethod !== 'POST') {
        return respond(405, { valid: false, error: 'Method tidak diizinkan.' });
    }

    // --- Parse body ---
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return respond(400, { valid: false, error: 'Request body tidak valid (bukan JSON).' });
    }

    const { licenseKey, name, email } = body;

    // ============================================================
    // VALIDASI INPUT
    // ============================================================
    if (!licenseKey || !name || !email) {
        return respond(400, {
            valid: false,
            error: 'Data tidak lengkap. Isi Nama, Email, dan License Key.'
        });
    }

    if (typeof licenseKey !== 'string' || licenseKey.trim().length === 0 || licenseKey.trim().length > 64) {
        return respond(400, { valid: false, error: 'Format license key tidak valid.' });
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
        return respond(400, { valid: false, error: 'Nama tidak boleh kosong.' });
    }

    if (typeof email !== 'string' || !email.includes('@')) {
        return respond(400, { valid: false, error: 'Format email tidak valid.' });
    }

    // ============================================================
    // CEK KONEKSI DATABASE
    // ============================================================
    let db;
    try {
        db = admin.database();
    } catch (err) {
        console.error('[validate-license] DB connection failed:', err.message);
        return respond(500, { valid: false, error: 'Koneksi database gagal. Coba lagi.' });
    }

    // ============================================================
    // LOOKUP LICENSE KEY DI FIREBASE
    // ============================================================
    let licSnap;
    try {
        licSnap = await db.ref(`licenses/${licenseKey.trim()}`).once('value');
    } catch (err) {
        console.error('[validate-license] DB read error:', err.message);
        return respond(500, { valid: false, error: 'Gagal membaca database. Coba lagi.' });
    }

    if (!licSnap.exists()) {
        return respond(200, { valid: false, error: 'License key tidak ditemukan.' });
    }

    const lic = licSnap.val();

    // ============================================================
    // COCOKKAN NAMA & EMAIL
    // Case-insensitive, trim whitespace di kedua sisi.
    // ============================================================
    const nameMatch  = (lic.name  || '').toLowerCase().trim() === name.toLowerCase().trim();
    const emailMatch = (lic.email || '').toLowerCase().trim() === email.toLowerCase().trim();

    if (!nameMatch || !emailMatch) {
        console.warn(`[validate-license] Mismatch: key=${licenseKey.trim()} | input_email=${email}`);
        return respond(200, {
            valid: false,
            error: 'Nama atau email tidak cocok dengan data pembelian.'
        });
    }

    // ============================================================
    // CEK STATUS LISENSI
    // ============================================================
    const status = (lic.status || '').toLowerCase();

    if (status === 'banned') {
        return respond(200, { valid: false, error: 'Lisensi ini telah dinonaktifkan oleh admin.' });
    }

    if (status === 'expired') {
        return respond(200, { valid: false, error: 'Lisensi sudah kedaluwarsa. Silakan perpanjang.' });
    }

    if (status !== 'active') {
        return respond(200, { valid: false, error: 'Lisensi tidak aktif.' });
    }

    // ============================================================
    // CEK TANGGAL KADALUARSA (jika bukan lifetime)
    // ============================================================
    if (lic.expiryDate && lic.expiryDate !== 'Seumur Hidup') {
        const expiry = new Date(lic.expiryDate);
        if (!isNaN(expiry) && expiry < new Date()) {
            // Auto-update status ke 'expired' di Firebase
            try {
                await db.ref(`licenses/${licenseKey.trim()}`).update({ status: 'expired' });
            } catch (err) {
                console.error('[validate-license] Auto-expire update failed:', err.message);
            }
            return respond(200, {
                valid: false,
                error: 'Lisensi Anda sudah kedaluwarsa. Silakan perpanjang di primadev.store.'
            });
        }
    }

    // ============================================================
    // ✅ SEMUA VALIDASI LULUS — LISENSI VALID
    // ============================================================
    console.log(`[validate-license] ✅ Valid: key=${licenseKey.trim()} | email=${email.toLowerCase().trim()}`);

    return respond(200, {
        valid: true,
        holderName: lic.name,
        appName:    lic.appName    || 'Primadev Extension',
        appId:      lic.appId      || '',
        expiryDate: lic.expiryDate || 'Seumur Hidup',
        licenseType: lic.type      || 'extension',
        message:    'Lisensi valid. Extension berhasil diaktifkan.'
    });
};
