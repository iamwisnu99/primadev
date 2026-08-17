
const admin = require('firebase-admin');

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

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

const respond = (statusCode, body) => ({
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
});

const netlifyHandler = async (event) => {

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return respond(405, { valid: false, error: 'Method tidak diizinkan.' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return respond(400, { valid: false, error: 'Request body tidak valid (bukan JSON).' });
    }

    const { licenseKey, name, email } = body;

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

    let db;
    try {
        db = admin.database();
    } catch (err) {
        console.error('[validate-license] DB connection failed:', err.message);
        return respond(500, { valid: false, error: 'Koneksi database gagal. Coba lagi.' });
    }

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

    const nameMatch = (lic.name || '').toLowerCase().trim() === name.toLowerCase().trim();
    const emailMatch = (lic.email || '').toLowerCase().trim() === email.toLowerCase().trim();

    if (!nameMatch || !emailMatch) {
        console.warn(`[validate-license] Mismatch: key=${licenseKey.trim()} | input_email=${email}`);
        return respond(200, {
            valid: false,
            error: 'Nama atau email tidak cocok dengan data pembelian.'
        });
    }

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

    if (lic.expiryDate && lic.expiryDate !== 'Seumur Hidup') {
        const expiry = new Date(lic.expiryDate);
        if (!isNaN(expiry) && expiry < new Date()) {
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

    console.log(`[validate-license] ✅ Valid: key=${licenseKey.trim()} | email=${email.toLowerCase().trim()}`);

    return respond(200, {
        valid: true,
        holderName: lic.name,
        appName: lic.appName || 'Primadev Extension',
        appId: lic.appId || '',
        expiryDate: lic.expiryDate || 'Seumur Hidup',
        licenseType: lic.type || 'extension',
        message: 'Lisensi valid. Extension berhasil diaktifkan.'
    });
};

module.exports = async (req, res) => {
    const event = {
        httpMethod: req.method,
        path: req.url.split('?')[0],
        queryStringParameters: req.query || {},
        body: typeof req.body === 'object' ? JSON.stringify(req.body) : (req.body || null),
        headers: req.headers
    };
    
    try {
        const result = await netlifyHandler(event, {});
        if (result.headers) {
            Object.keys(result.headers).forEach(k => res.setHeader(k, result.headers[k]));
        }
        res.status(result.statusCode || 200).send(result.body);
    } catch (err) {
        console.error("Wrapper Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
