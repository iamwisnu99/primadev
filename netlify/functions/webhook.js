const admin = require('firebase-admin');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { getPremiumTemplate, getRenewalTemplate } = require('./email_template');

let PRICING_DB;
try { PRICING_DB = require('../../products.json'); } catch (e) { PRICING_DB = {}; }

// =====================================================================
// INISIALISASI FIREBASE
// =====================================================================
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
        } else if (!process.env.NETLIFY) {
            try {
                serviceAccount = require('../../strukmaker-3327d110-firebase-adminsdk-fbsvc-28cd459e84.json');
            } catch (e) {
                console.log("[INIT] File JSON lokal tidak ditemukan.");
            }
        }
    } catch (err) {
        console.error("[INIT ERROR] Gagal memproses kredensial:", err.message);
    }

    const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app";
    if (serviceAccount && serviceAccount.privateKey) {
        if (!serviceAccount.privateKey.includes("BEGIN PRIVATE KEY")) {
            console.error("[INIT] Format Private Key Firebase tidak valid. Verifikasi isi FIREBASE_PRIVATE_KEY.");
        } else {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: dbUrl
            });
            console.log("[INIT] Firebase Webhook: koneksi berhasil.");
        }
    } else {
        console.error("[INIT] Kredensial Firebase tidak tersedia.");
    }
}

const db = admin.database();

// =====================================================================
// HELPER: GENERATE LICENSE KEY
// =====================================================================
const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = () => Array(4).fill(0).map(() => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `PRIMA-${seg()}-${seg()}-${seg()}`;
};

// =====================================================================
// HELPER: KIRIM EMAIL
// =====================================================================
const sendEmail = async (data, isRenewal = false) => {
    const url = 'https://api.emailjs.com/api/v1.0/email/send';
    if (!process.env.EMAILJS_SERVICE_ID) return;

    const templateData = {
        name: data.name,
        key: data.key,
        appName: data.appName || 'Aplikasi',
        type: data.type || (isRenewal ? 'Renewal' : 'Monthly'),
        expiryDate: data.expiryDate,
        transactionId: data.transactionId || data.orderId
    };

    const messageHtml = isRenewal ? getRenewalTemplate(templateData) : getPremiumTemplate(templateData);

    const payload = {
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
            to_email: data.email,
            to_name: data.name,
            license_key: data.key,
            expiry_date: data.expiryDate,
            type: isRenewal ? `Perpanjangan ${data.appName}` : `${data.appName} (${data.type})`,
            message_html: messageHtml
        }
    };

    try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) {
        console.error("[EMAIL] Gagal mengirim email:", e.message);
    }
};

// =====================================================================
// HELPER: VERIFIKASI SIGNATURE MIDTRANS
// Formula: SHA512(order_id + status_code + gross_amount + ServerKey)
// Ref: https://docs.midtrans.com/reference/verifying-payment-notification
// =====================================================================
const verifyMidtransSignature = (notification, serverKey) => {
    const { order_id, status_code, gross_amount, signature_key } = notification;
    if (!signature_key || !order_id || !status_code || !gross_amount) return false;
    const rawString = String(order_id) + String(status_code) + String(gross_amount) + String(serverKey);
    const expected = crypto.createHash('sha512').update(rawString).digest('hex');
    const isValid = expected === signature_key;
    if (!isValid) console.error(`[WEBHOOK-MIDTRANS] Signature tidak cocok. Kemungkinan notifikasi palsu. OrderID: ${order_id}`);
    return isValid;
};

// =====================================================================
// HELPER: NORMALISASI STATUS MIDTRANS → STATUS INTERNAL
// transaction_status: capture/settlement → 'settlement'
//                     deny/expire/cancel → 'cancel'
//                     pending           → 'pending'
// fraud_status: jika 'deny' → selalu cancel meski transaction_status lain
// =====================================================================
const normalizeMidtransStatus = (notification) => {
    const ts = (notification.transaction_status || '').toLowerCase();
    const fs = (notification.fraud_status || '').toLowerCase();
    if (fs === 'deny') return 'cancel';
    if (ts === 'capture' || ts === 'settlement') return 'settlement';
    if (ts === 'deny' || ts === 'expire' || ts === 'cancel') return 'cancel';
    return 'pending';
};

// =====================================================================
// MAIN WEBHOOK HANDLER — Xendit + Midtrans (Dual Gateway)
// =====================================================================
exports.handler = async (event) => {
    // Tentukan apakah berjalan di lingkungan Netlify (production/staging)
    // Jika ya, verifikasi token/signature WAJIB — tidak boleh dilewati
    const isProductionEnv = !!process.env.NETLIFY;

    try {
        if (event.httpMethod === 'GET' || !event.body) {
            return { statusCode: 200, body: 'Endpoint webhook aktif (Xendit + Midtrans)' };
        }

        const notification = JSON.parse(event.body);
        console.log('[WEBHOOK] Notifikasi diterima:', JSON.stringify(notification));

        // ----------------------------------------------------------------
        // STEP 1: EKSTRAK ORDER ID
        // Coba semua lokasi yang mungkin dari Xendit maupun Midtrans
        // ----------------------------------------------------------------
        let orderId =
            notification.order_id           // Midtrans (semua tipe pembayaran)
            || notification.external_id    // Xendit VA & Retail
            || notification.data?.reference_id  // Xendit eWallet (nested)
            || notification.reference_id   // Xendit QRIS (root level)
            || notification.data?.metadata?.order_id
            || notification.metadata?.order_id
            || null;

        if (!orderId) {
            console.error('[WEBHOOK] OrderID tidak ditemukan dalam payload. Webhook diabaikan. Payload:', JSON.stringify(notification));
            return { statusCode: 200, body: 'OK - No orderId found' };
        }

        orderId = String(orderId).trim();
        console.log(`[WEBHOOK] OrderID terdeteksi: ${orderId}`);

        // ----------------------------------------------------------------
        // STEP 2: CARI TRANSAKSI DI FIREBASE → TENTUKAN GATEWAY
        // ----------------------------------------------------------------
        const trxRef = db.ref(`transactions/${orderId}`);
        const trxSnap = await trxRef.once('value');

        if (!trxSnap.exists()) {
            console.error(`[WEBHOOK] Transaksi tidak ditemukan di database. OrderID: ${orderId}. Webhook diabaikan.`);
            return { statusCode: 200, body: 'Transaction not found in DB but acknowledged' };
        }

        const trxData = trxSnap.val();

        // Sudah diproses sebelumnya — idempotency guard
        if (trxData.status === 'success') {
            console.log(`[WEBHOOK] OrderID: ${orderId} sudah pernah diproses sebelumnya. Webhook dilewati.`);
            return { statusCode: 200, body: 'Already processed' };
        }

        const gateway = (trxData.gateway || 'xendit').toLowerCase();
        console.log(`[WEBHOOK] Gateway dari database: ${gateway}`);

        // ----------------------------------------------------------------
        // STEP 3: VERIFIKASI KEAMANAN BERDASARKAN GATEWAY
        // ----------------------------------------------------------------
        let transactionStatus = 'pending';
        let paymentType = gateway === 'midtrans' ? 'Midtrans' : 'Xendit';

        if (gateway === 'midtrans') {
            // Midtrans: verifikasi signature SHA-512
            // Formula: SHA512(order_id + status_code + gross_amount + serverKey)
            const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
            if (!serverKey) {
                if (isProductionEnv) {
                    console.error(`[WEBHOOK-MIDTRANS] MIDTRANS_SERVER_KEY tidak dikonfigurasi. Verifikasi wajib di Netlify. Webhook ditolak. OrderID: ${orderId}`);
                    return { statusCode: 403, body: 'Webhook tidak dapat diproses - MIDTRANS_SERVER_KEY belum dikonfigurasi' };
                }
                console.warn('[WEBHOOK-MIDTRANS] MIDTRANS_SERVER_KEY tidak dikonfigurasi. Verifikasi signature dilewati (mode lokal).');
            } else {
                const isValid = verifyMidtransSignature(notification, serverKey);
                if (!isValid) {
                    console.error(`[WEBHOOK-MIDTRANS] Verifikasi signature gagal. Kemungkinan notifikasi palsu. OrderID: ${orderId}`);
                    return { statusCode: 403, body: 'Forbidden - Signature Midtrans tidak valid' };
                }
                console.log(`[WEBHOOK-MIDTRANS] Verifikasi signature berhasil. OrderID: ${orderId}`);
            }

            transactionStatus = normalizeMidtransStatus(notification);

            // Label metode pembayaran Midtrans
            const pt = (notification.payment_type || '').toLowerCase();
            const bank = notification.bank || notification.va_numbers?.[0]?.bank || '';
            if (pt === 'bank_transfer' || pt === 'echannel') {
                paymentType = `Midtrans VA (${bank.toUpperCase() || 'Bank'})`;
            } else if (pt === 'qris') {
                paymentType = 'Midtrans QRIS';
            } else if (pt === 'gopay') {
                paymentType = 'Midtrans GoPay';
            } else if (pt === 'shopeepay') {
                paymentType = 'Midtrans ShopeePay';
            } else if (pt === 'dana') {
                paymentType = 'Midtrans DANA';
            } else if (pt === 'ovo') {
                paymentType = 'Midtrans OVO';
            } else if (pt === 'cstore') {
                paymentType = `Midtrans Store (${notification.store || 'Retail'})`;
            } else {
                paymentType = `Midtrans (${pt})`;
            }

        } else {
            // Xendit: verifikasi x-callback-token
            const xCallbackToken =
                event.headers?.['x-callback-token']
                || event.headers?.['X-Callback-Token']
                || null;

            if (!process.env.XENDIT_CALLBACK_TOKEN) {
                if (isProductionEnv) {
                    console.error(`[WEBHOOK-XENDIT] XENDIT_CALLBACK_TOKEN tidak dikonfigurasi. Verifikasi wajib di Netlify. Webhook ditolak. OrderID: ${orderId}`);
                    return { statusCode: 403, body: 'Webhook tidak dapat diproses - XENDIT_CALLBACK_TOKEN belum dikonfigurasi' };
                }
                console.warn('[WEBHOOK-XENDIT] XENDIT_CALLBACK_TOKEN tidak dikonfigurasi. Verifikasi token dilewati (mode lokal).');
            } else {
                if (!xCallbackToken || xCallbackToken !== process.env.XENDIT_CALLBACK_TOKEN) {
                    console.error(`[WEBHOOK-XENDIT] Token callback tidak valid atau tidak ada. Kemungkinan webhook palsu. OrderID: ${orderId}`);
                    return { statusCode: 403, body: 'Forbidden - Token callback Xendit tidak valid' };
                }
                console.log(`[WEBHOOK-XENDIT] Verifikasi token callback berhasil. OrderID: ${orderId}`);
            }

            // Normalisasi status Xendit
            const isEwalletPayload = !!(notification.data && (notification.data.reference_id || notification.data.status));
            const rawStatus = (
                (isEwalletPayload ? notification.data?.status : null)
                || notification.status
                || ''
            ).toUpperCase();

            if (
                rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' || rawStatus === 'PAID' ||
                (!rawStatus && notification.bank_code && notification.account_number)
            ) {
                transactionStatus = 'settlement';
            } else if (rawStatus === 'FAILED' || rawStatus === 'EXPIRED' || rawStatus === 'CANCELLED') {
                transactionStatus = 'cancel';
            } else {
                transactionStatus = 'pending';
            }

            // Verifikasi silang jumlah pembayaran dari webhook dengan jumlah tersimpan di database
            // Ini mencegah skenario di mana webhook palsu dibuat menggunakan orderId yang valid
            if (transactionStatus === 'settlement' && trxData.amount !== undefined) {
                const webhookAmount = Number(
                    notification.amount || notification.expected_amount ||
                    notification.data?.amount || 0
                );
                if (webhookAmount > 0) {
                    const storedAmount = Number(trxData.amount);
                    const diff = Math.abs(webhookAmount - storedAmount);
                    if (diff > 1) { // toleransi 1 IDR untuk pembulatan
                        console.error(`[WEBHOOK-XENDIT] Jumlah tidak cocok. Database: ${storedAmount}, Webhook: ${webhookAmount}. OrderID: ${orderId}. Webhook ditolak.`);
                        return { statusCode: 200, body: 'Jumlah tidak cocok - webhook diabaikan' };
                    }
                }
            }

            // Label metode pembayaran Xendit
            const channelCode = notification.data?.channel_code || notification.channel_code || '';
            if (notification.bank_code) {
                paymentType = `Xendit VA (${notification.bank_code})`;
            } else if (channelCode) {
                paymentType = `Xendit eWallet (${channelCode})`;
            } else if (notification.qr_string || notification.type === 'DYNAMIC') {
                paymentType = 'Xendit QRIS';
            } else if (notification.retail_outlet_name) {
                paymentType = `Xendit Store (${notification.retail_outlet_name})`;
            }
        }

        console.log(`[WEBHOOK] Gateway: ${gateway} | Status: ${transactionStatus} | Metode Pembayaran: ${paymentType}`);

        // ----------------------------------------------------------------
        // STEP 4: PROSES PEMBAYARAN BERHASIL
        // ----------------------------------------------------------------
        if (transactionStatus === 'settlement') {

            await trxRef.update({
                status: 'success',
                payment_type: paymentType,
                paidAt: Date.now()
            });

            console.log(`[WEBHOOK] Transaksi berhasil dikonfirmasi. OrderID: ${orderId} | Tipe: ${trxData.orderType || 'NEW'}`);

            // ---- RENEWAL: Perpanjang lisensi yang sudah ada ----
            if (trxData.orderType === 'RENEWAL') {
                const targetKey = trxData.targetLicenseKey;
                if (!targetKey) {
                    console.error('[WEBHOOK] targetLicenseKey kosong untuk RENEWAL. Data transaksi tidak lengkap.');
                    return { statusCode: 200, body: 'Missing target key' };
                }

                const licRef = db.ref(`licenses/${targetKey}`);
                const licSnap = await licRef.once('value');
                if (!licSnap.exists()) {
                    console.error(`[WEBHOOK] Data lisensi tidak ditemukan di database. Kunci: ${targetKey}`);
                    return { statusCode: 200, body: 'License not found' };
                }

                const currentData = licSnap.val();
                const duration = trxData.duration || 'monthly';
                const now = new Date();
                let currentExpiry = currentData.expiryDate ? new Date(currentData.expiryDate) : null;
                if (currentExpiry && isNaN(currentExpiry.getTime())) currentExpiry = null;

                let baseDate = (currentExpiry && currentExpiry > now) ? currentExpiry : now;
                let newExpiry = new Date(baseDate);
                if (duration === 'yearly') newExpiry.setFullYear(newExpiry.getFullYear() + 1);
                else newExpiry.setMonth(newExpiry.getMonth() + 1);

                const expiryString = newExpiry.toISOString().split('T')[0];
                console.log(`[WEBHOOK] Memperpanjang lisensi: ${currentData.expiryDate} ke ${expiryString} (${duration})`);

                await licRef.update({
                    status: 'active',
                    expiryDate: expiryString,
                    lastRenewalDate: Date.now(),
                    lastTransactionId: orderId
                });

                await sendEmail({
                    name: currentData.name, email: currentData.email,
                    key: targetKey, appName: currentData.appName,
                    expiryDate: expiryString, transactionId: orderId
                }, true);

                console.log(`[WEBHOOK] Lisensi ${targetKey} berhasil diperpanjang.`);

            // ---- PEMBELIAN BARU: Buat lisensi baru ----
            } else {
                console.log('[WEBHOOK] Membuat lisensi baru...');

                const newKey = generateRandomKey();
                const duration = trxData.duration || 'monthly';

                let expiry = new Date();
                if (duration === 'monthly') expiry.setMonth(expiry.getMonth() + 1);
                else if (duration === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1);
                else expiry.setFullYear(expiry.getFullYear() + 100); // Lifetime

                const newLicenseData = {
                    key: newKey,
                    status: 'active',
                    type: duration,
                    appName: trxData.appName || 'Aplikasi',
                    appId: trxData.appId || '',
                    name: trxData.customerName || 'Customer',
                    email: trxData.customerEmail || '',
                    price: trxData.amount || 0,
                    deviceId: '',
                    expiryDate: expiry.toISOString().split('T')[0],
                    paymentMethod: paymentType,
                    gateway,
                    transactionId: orderId,
                    createdAt: Date.now()
                };

                await db.ref(`licenses/${newKey}`).set(newLicenseData);

                await sendEmail({
                    email: newLicenseData.email, name: newLicenseData.name,
                    key: newKey, appName: newLicenseData.appName,
                    type: newLicenseData.type, expiryDate: newLicenseData.expiryDate,
                    transactionId: orderId
                });

                console.log(`[WEBHOOK] Lisensi baru berhasil dibuat: ${newKey} via ${gateway}`);
            }

            return { statusCode: 200, body: 'OK - Processed' };

        // ----------------------------------------------------------------
        // STEP 5: PEMBAYARAN GAGAL / DIBATALKAN
        // ----------------------------------------------------------------
        } else if (transactionStatus === 'cancel') {
            await trxRef.update({ status: 'failed' });
            console.log(`[WEBHOOK] Transaksi ${orderId} gagal atau dibatalkan. Status diperbarui ke failed.`);
            return { statusCode: 200, body: 'OK - Failed status recorded' };
        }

        return { statusCode: 200, body: 'OK - Pending or other status' };

    } catch (err) {
        console.error('[WEBHOOK] Terjadi kesalahan saat memproses webhook:', err);
        return { statusCode: 500, body: err.message };
    }
};