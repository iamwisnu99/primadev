const admin = require('firebase-admin');
const fetch = require('node-fetch');

// =====================================================================
// XENDIT-ONLY WEBHOOK
// Midtrans telah dihapus. Hanya memproses notifikasi dari Xendit.
// =====================================================================
const { getPremiumTemplate, getRenewalTemplate } = require('./email_template');

// Fallback produk lokal (jika Firebase tidak terbaca)
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
            console.error("❌ FATAL: Format Private Key SALAH!");
        } else {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: dbUrl
            });
            console.log("✅ Firebase Webhook: Connected");
        }
    } else {
        console.error("❌ FATAL: Kredensial Firebase tidak tersedia.");
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
        console.error("[EMAIL ERROR]", e.message);
    }
};

// =====================================================================
// MAIN WEBHOOK HANDLER — XENDIT ONLY
// =====================================================================
exports.handler = async (event) => {
    try {
        // Biarkan GET request tetap sukses (untuk health check Xendit)
        if (event.httpMethod === 'GET' || !event.body) {
            return { statusCode: 200, body: 'Webhook endpoint active (Xendit-only)' };
        }

        const notification = JSON.parse(event.body);
        console.log("[WEBHOOK] Received notification:", JSON.stringify(notification));

        // ----------------------------------------------------------------
        // VERIFIKASI TOKEN XENDIT
        // Xendit mengirim header 'x-callback-token' pada setiap notifikasi.
        // Wajib diverifikasi agar tidak ada pihak lain yang bisa trigger webhook.
        // ----------------------------------------------------------------
        const xCallbackToken = event.headers?.['x-callback-token']
            || event.headers?.['X-Callback-Token']
            || event.headers?.['x-callback-Token']
            || null;

        if (process.env.XENDIT_CALLBACK_TOKEN) {
            if (!xCallbackToken || xCallbackToken !== process.env.XENDIT_CALLBACK_TOKEN) {
                console.error("[WEBHOOK] ⛔ Invalid or missing Xendit callback token!");
                return { statusCode: 403, body: 'Forbidden - Invalid callback token' };
            }
        } else {
            console.warn("[WEBHOOK] ⚠️ XENDIT_CALLBACK_TOKEN tidak dikonfigurasi. Verifikasi token dilewati.");
        }

        // ----------------------------------------------------------------
        // EKSTRAK ORDER ID & STATUS DARI PAYLOAD XENDIT
        //
        // Xendit mengirim format berbeda tergantung jenis pembayaran:
        //
        // [Virtual Account]  → notification.external_id, notification.status
        // [QRIS]             → notification.reference_id, notification.status
        // [eWallet]          → notification.data.reference_id, notification.data.status
        //                      (status di ROOT selalu kosong untuk eWallet!)
        // [Retail/cStore]    → notification.external_id, notification.status
        // ----------------------------------------------------------------

        // Deteksi apakah ini payload eWallet (punya wrapper 'data')
        const isEwalletPayload = !!(notification.data && (notification.data.reference_id || notification.data.status));

        let orderId = null;
        let transactionStatus = null;
        let paymentType = 'Xendit';

        // --- Ekstrak orderId ---
        if (notification.external_id) {
            // Virtual Account & Retail Store
            orderId = notification.external_id;
        } else if (isEwalletPayload && notification.data.reference_id) {
            // eWallet (nested)
            orderId = notification.data.reference_id;
        } else if (notification.reference_id) {
            // QRIS (root level)
            orderId = notification.reference_id;
        } else if (notification.data?.metadata?.order_id) {
            // Fallback: metadata yang diset saat create charge
            orderId = notification.data.metadata.order_id;
        } else if (notification.metadata?.order_id) {
            orderId = notification.metadata.order_id;
        }

        if (!orderId) {
            console.error("[WEBHOOK] ❌ Tidak bisa menemukan orderId dalam payload:", JSON.stringify(notification));
            return { statusCode: 200, body: 'OK - No orderId found' };
        }

        // --- Ekstrak status ---
        // PENTING: Untuk eWallet, status ada di notification.data.status, BUKAN notification.status
        const rawStatus = (
            (isEwalletPayload ? notification.data?.status : null) // eWallet → cek data.status duluan
            || notification.status                                 // VA, QRIS, Retail
            || ''
        ).toUpperCase();

        console.log(`[WEBHOOK] isEwallet: ${isEwalletPayload} | rawStatus: "${rawStatus}" | orderId: "${orderId}"`);

        // Normalisasi status Xendit ke status internal
        if (
            rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' || rawStatus === 'PAID' ||
            // VA yang sudah dibayar: tidak punya 'status', tapi ada bank_code + account_number
            (!rawStatus && notification.bank_code && notification.account_number)

        ) {
            transactionStatus = 'settlement';
        } else if (rawStatus === 'FAILED' || rawStatus === 'EXPIRED' || rawStatus === 'CANCELLED') {
            transactionStatus = 'cancel';
        } else {
            transactionStatus = 'pending';
        }

        // Label metode pembayaran
        // (eWallet: data nested; VA & Store: root level)
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

        console.log(`[WEBHOOK] OrderID: ${orderId} | RawStatus: "${rawStatus}" | InternalStatus: ${transactionStatus} | Type: ${paymentType}`);

        // ----------------------------------------------------------------
        // PROSES JIKA PEMBAYARAN BERHASIL
        // ----------------------------------------------------------------
        if (transactionStatus === 'settlement') {
            // Ambil data transaksi dari Firebase
            const trxSnap = await db.ref(`transactions/${orderId}`).once('value');
            if (!trxSnap.exists()) {
                console.error(`[WEBHOOK] ❌ Transaksi ${orderId} tidak ditemukan di Firebase!`);
                // Return 200 agar Xendit tidak retry terus-menerus
                return { statusCode: 200, body: 'Transaction not found in DB but acknowledged' };
            }

            const trxData = trxSnap.val();

            // Guard: Jangan proses dua kali
            if (trxData.status === 'success') {
                console.log(`[WEBHOOK] ⏩ Order ${orderId} sudah diproses sebelumnya.`);
                return { statusCode: 200, body: 'Already processed' };
            }

            // Update status transaksi di Firebase → success
            await db.ref(`transactions/${orderId}`).update({
                status: 'success',
                payment_type: paymentType,
                paidAt: Date.now()
            });

            console.log(`[WEBHOOK] ✅ Transaksi ${orderId} ditandai sukses. OrderType: ${trxData.orderType || 'NEW'}`);

            // ----------------------------------------------------------
            // RENEWAL: Perpanjang lisensi yang sudah ada
            // ----------------------------------------------------------
            if (trxData.orderType === 'RENEWAL') {
                const targetKey = trxData.targetLicenseKey;
                if (!targetKey) {
                    console.error("[WEBHOOK] ❌ targetLicenseKey kosong untuk RENEWAL!");
                    return { statusCode: 200, body: 'Missing target key' };
                }

                const licRef = db.ref(`licenses/${targetKey}`);
                const licSnap = await licRef.once('value');

                if (!licSnap.exists()) {
                    console.error(`[WEBHOOK] ❌ Lisensi ${targetKey} tidak ditemukan!`);
                    return { statusCode: 200, body: 'License not found' };
                }

                const currentData = licSnap.val();
                const duration = trxData.duration || 'monthly';
                const now = new Date();
                let currentExpiry = currentData.expiryDate ? new Date(currentData.expiryDate) : null;
                if (currentExpiry && isNaN(currentExpiry.getTime())) currentExpiry = null;

                // Perpanjang dari tanggal expiry saat ini (jika belum kadaluarsa) atau dari hari ini
                let baseDate = (currentExpiry && currentExpiry > now) ? currentExpiry : now;
                let newExpiry = new Date(baseDate);
                if (duration === 'yearly') newExpiry.setFullYear(newExpiry.getFullYear() + 1);
                else newExpiry.setMonth(newExpiry.getMonth() + 1);

                const expiryString = newExpiry.toISOString().split('T')[0];
                console.log(`[WEBHOOK] Perpanjang: ${currentData.expiryDate} → ${expiryString} (${duration})`);

                await licRef.update({
                    status: 'active',
                    expiryDate: expiryString,
                    lastRenewalDate: Date.now(),
                    lastTransactionId: orderId
                });

                await sendEmail({
                    name: currentData.name,
                    email: currentData.email,
                    key: targetKey,
                    appName: currentData.appName,
                    expiryDate: expiryString,
                    transactionId: orderId
                }, true);

                console.log(`[WEBHOOK] ✅ Lisensi ${targetKey} berhasil diperpanjang.`);

            // ----------------------------------------------------------
            // PEMBELIAN BARU: Buat lisensi baru
            // ----------------------------------------------------------
            } else {
                console.log("[WEBHOOK] 🆕 Membuat lisensi baru...");

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
                    transactionId: orderId,
                    createdAt: Date.now()
                };

                await db.ref(`licenses/${newKey}`).set(newLicenseData);

                await sendEmail({
                    email: newLicenseData.email,
                    name: newLicenseData.name,
                    key: newKey,
                    appName: newLicenseData.appName,
                    type: newLicenseData.type,
                    expiryDate: newLicenseData.expiryDate,
                    transactionId: orderId
                });

                console.log(`[WEBHOOK] ✅ Lisensi baru dibuat: ${newKey}`);
            }

            return { statusCode: 200, body: 'OK - Processed' };

        // ----------------------------------------------------------------
        // PROSES JIKA PEMBAYARAN GAGAL / DIBATALKAN
        // ----------------------------------------------------------------
        } else if (transactionStatus === 'cancel') {
            if (orderId) {
                await db.ref(`transactions/${orderId}`).update({ status: 'failed' });
                console.log(`[WEBHOOK] ❌ Transaksi ${orderId} gagal/dibatalkan.`);
            }
            return { statusCode: 200, body: 'OK - Failed status recorded' };
        }

        // Status lain (pending, dll.) — tidak perlu tindakan
        return { statusCode: 200, body: 'OK - Pending or other status' };

    } catch (err) {
        console.error("[WEBHOOK] Error:", err);
        return { statusCode: 500, body: err.message };
    }
};