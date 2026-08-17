const admin = require('firebase-admin');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { getPremiumTemplate, getRenewalTemplate } = require('../utils/email_template');

let PRICING_DB;
try { PRICING_DB = require('../../products.json'); } catch (e) { PRICING_DB = {}; }

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

const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const seg = () => Array(4).fill(0).map(() => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `PRIMA-${seg()}-${seg()}-${seg()}`;
};

const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (data, isRenewal = false) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn("[EMAIL] Kredensial Gmail tidak diset. Email tidak dikirim.");
        return;
    }

    const templateData = {
        name: data.name,
        key: data.key,
        appName: data.appName || 'Aplikasi',
        type: data.type || (isRenewal ? 'Renewal' : 'Monthly'),
        expiryDate: data.expiryDate,
        transactionId: data.transactionId || data.orderId
    };

    const messageHtml = isRenewal ? getRenewalTemplate(templateData) : getPremiumTemplate(templateData);
    const subject = isRenewal ? `Perpanjangan Lisensi ${data.appName}` : `Pesanan Selesai: Lisensi ${data.appName} (${data.type})`;

    try {
        const info = await transporter.sendMail({
            from: `"PT. Primadev Digital Technology" <${process.env.EMAIL_USER}>`,
            to: data.email,
            subject: subject,
            html: messageHtml
        });
        console.log("[EMAIL] Email terkirim:", info.messageId);
    } catch (e) {
        console.error("[EMAIL] Gagal mengirim email:", e.message);
    }
};

const verifyMidtransSignature = (notification, serverKey) => {
    const { order_id, status_code, gross_amount, signature_key } = notification;
    if (!signature_key || !order_id || !status_code || !gross_amount) return false;
    const rawString = String(order_id) + String(status_code) + String(gross_amount) + String(serverKey);
    const expected = crypto.createHash('sha512').update(rawString).digest('hex');
    const isValid = expected === signature_key;
    if (!isValid) console.error(`[WEBHOOK-MIDTRANS] Signature tidak cocok. Kemungkinan notifikasi palsu. OrderID: ${order_id}`);
    return isValid;
};

const normalizeMidtransStatus = (notification) => {
    const ts = (notification.transaction_status || '').toLowerCase();
    const fs = (notification.fraud_status || '').toLowerCase();
    if (fs === 'deny') return 'cancel';
    if (ts === 'capture' || ts === 'settlement') return 'settlement';
    if (ts === 'deny' || ts === 'expire' || ts === 'cancel') return 'cancel';
    return 'pending';
};

const netlifyHandler = async (event) => {
    const isProductionEnv = !!process.env.NETLIFY;

    try {
        if (event.httpMethod === 'GET' || !event.body) {
            return { statusCode: 200, body: 'Endpoint webhook aktif (Xendit + Midtrans)' };
        }

        const notification = JSON.parse(event.body);
        console.log('[WEBHOOK] Notifikasi diterima:', JSON.stringify(notification));

        let orderId =
            notification.order_id
            || notification.external_id
            || notification.data?.reference_id
            || notification.reference_id
            || notification.data?.metadata?.order_id
            || notification.metadata?.order_id
            || null;

        if (!orderId) {
            console.error('[WEBHOOK] OrderID tidak ditemukan dalam payload. Webhook diabaikan. Payload:', JSON.stringify(notification));
            return { statusCode: 200, body: 'OK - No orderId found' };
        }

        orderId = String(orderId).trim();
        console.log(`[WEBHOOK] OrderID terdeteksi: ${orderId}`);

        const trxRef = db.ref(`transactions/${orderId}`);
        const trxSnap = await trxRef.once('value');

        if (!trxSnap.exists()) {
            console.error(`[WEBHOOK] Transaksi tidak ditemukan di database. OrderID: ${orderId}. Webhook diabaikan.`);
            return { statusCode: 200, body: 'Transaction not found in DB but acknowledged' };
        }

        const trxData = trxSnap.val();

        if (trxData.status === 'success') {
            console.log(`[WEBHOOK] OrderID: ${orderId} sudah pernah diproses sebelumnya. Webhook dilewati.`);
            return { statusCode: 200, body: 'Already processed' };
        }

        const gateway = (trxData.gateway || 'xendit').toLowerCase();
        console.log(`[WEBHOOK] Gateway dari database: ${gateway}`);

        let transactionStatus = 'pending';
        let paymentType = gateway === 'midtrans' ? 'Midtrans' : 'Xendit';

        if (gateway === 'midtrans') {
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

            if (transactionStatus === 'settlement' && trxData.amount !== undefined) {
                const webhookAmount = Number(
                    notification.amount || notification.expected_amount ||
                    notification.data?.amount || 0
                );
                if (webhookAmount > 0) {
                    const storedAmount = Number(trxData.amount);
                    const diff = Math.abs(webhookAmount - storedAmount);
                    if (diff > 1) { 
                        console.error(`[WEBHOOK-XENDIT] Jumlah tidak cocok. Database: ${storedAmount}, Webhook: ${webhookAmount}. OrderID: ${orderId}. Webhook ditolak.`);
                        return { statusCode: 200, body: 'Jumlah tidak cocok - webhook diabaikan' };
                    }
                }
            }

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

        if (transactionStatus === 'settlement') {

            await trxRef.update({
                status: 'success',
                payment_type: paymentType,
                paidAt: Date.now()
            });

            console.log(`[WEBHOOK] Transaksi berhasil dikonfirmasi. OrderID: ${orderId} | Tipe: ${trxData.orderType || 'NEW'}`);

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

            } else {
                console.log('[WEBHOOK] Membuat lisensi baru...');

                const newKey = generateRandomKey();
                const duration = trxData.duration || 'monthly';

                let expiry = new Date();
                if (duration === 'monthly') expiry.setMonth(expiry.getMonth() + 1);
                else if (duration === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1);
                else expiry.setFullYear(expiry.getFullYear() + 100); 

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
