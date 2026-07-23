const admin = require('firebase-admin');
const fetch = require('node-fetch');

const XENDIT_PUBLIC_KEY = process.env.XENDIT_PUBLIC_KEY || '';
const { getPremiumTemplate, getRenewalTemplate } = require('./email_template');

console.log("[INIT] Xendit-Only Mode Aktif");
console.log("[INIT] - XENDIT_SECRET_KEY set:", !!process.env.XENDIT_SECRET_KEY);
console.log("[INIT] - XENDIT_PUBLIC_KEY set:", !!XENDIT_PUBLIC_KEY);

if (!process.env.XENDIT_SECRET_KEY) {
    console.error("FATAL: XENDIT_SECRET_KEY belum dikonfigurasi di .env atau Netlify Dashboard!");
}

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
                const localKey = '../../strukmaker-3327d110-firebase-adminsdk-fbsvc-28cd459e84.json';
                serviceAccount = require(localKey);
            } catch (e) {
                console.log("[INIT] File JSON lokal tidak ditemukan.");
            }
        }
    } catch (err) {
        console.error("[INIT ERROR] Gagal memproses kredensial:", err.message);
    }

    const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app";
    if (serviceAccount && (serviceAccount.privateKey || serviceAccount.private_key)) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: dbUrl
            });
            console.log("✅ Firebase Admin initialized successfully");
        } catch (initErr) {
            console.error("❌ Firebase Admin initialization failed:", initErr.message);
        }
    } else {
        console.error("❌ Missing or invalid serviceAccount credentials");
    }
}

const getDb = () => {
    if (admin.apps.length) return admin.database();
    return null;
};

// =====================================================================
// HELPER: GENERATE LICENSE KEY
// =====================================================================
const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return `PRIMA-${Array.from({ length: 3 }, () =>
        Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    ).join('-')}`;
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
        appName: data.appName,
        type: data.type || (isRenewal ? 'Renewal' : 'Monthly'),
        expiryDate: data.expiryDate,
        transactionId: data.transactionId || data.orderId
    };

    const messageHtml = isRenewal ? getRenewalTemplate(templateData) : getPremiumTemplate(templateData);

    const emailPayload = {
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
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emailPayload) });
    } catch (e) {
        console.error("[EMAIL ERROR]", e);
    }
};

// =====================================================================
// XENDIT CHARGE ADAPTER
// Semua metode pembayaran diproses di sini via Xendit API langsung.
// =====================================================================
const executeXenditCharge = async (payload, xenditSecretKey, dynamicWebhookUrl, successRedirectUrl, failedRedirectUrl) => {
    if (!xenditSecretKey) {
        throw new Error("XENDIT_SECRET_KEY belum dikonfigurasi di file .env server.");
    }
    const { orderId, grossAmount, buyerName, buyerPhone, paymentMethod } = payload;
    const authHeader = 'Basic ' + Buffer.from(xenditSecretKey + ':').toString('base64');
    const commonHeaders = {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'x-callback-url': dynamicWebhookUrl,
        'callback-url': dynamicWebhookUrl,
        'api-version': '2022-07-31'
    };

    console.log(`[XENDIT] Executing charge | OrderID: ${orderId} | Method: ${paymentMethod} | Amount: ${grossAmount}`);

    // Helper: format pesan error Xendit
    const formatXenditError = (data, defaultMsg) => {
        let errMsg = data.message || data.error_code || defaultMsg;
        if (Array.isArray(data.errors) && data.errors.length > 0) {
            const detailedList = data.errors.map(e => `${e.path || e.field || ''}: ${e.message}`).join(' | ');
            errMsg = `${errMsg} (${detailedList})`;
        }
        return errMsg;
    };

    // ------------------------------------------------------------------
    // 1. VIRTUAL ACCOUNT (BCA, BNI, BRI, Permata, Mandiri, CIMB)
    // ------------------------------------------------------------------
    if (['bca', 'bni', 'bri', 'permata', 'mandiri', 'cimb'].includes(paymentMethod)) {
        const bankCode = paymentMethod.toUpperCase();
        const expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const vaBody = {
            external_id: orderId,
            bank_code: bankCode,
            name: buyerName || "Pelanggan Primadev",
            expected_amount: Number(grossAmount),
            is_closed: true,
            is_single_use: true,
            expiration_date: expirationDate
        };

        const res = await fetch('https://api.xendit.co/callback_virtual_accounts', {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(vaBody)
        });
        const data = await res.json();
        if (!res.ok) {
            console.error(`[XENDIT VA ERROR] Response:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, "Gagal membuat Virtual Account Xendit."));
        }

        return {
            order_id: orderId,
            gross_amount: grossAmount,
            payment_type: 'bank_transfer',
            va_numbers: [{ bank: paymentMethod, va_number: data.account_number }],
            transaction_status: 'pending',
            gateway: 'xendit'
        };
    }

    // ------------------------------------------------------------------
    // 2. QRIS
    // ------------------------------------------------------------------
    if (paymentMethod === 'qris') {
        const qrisBody = {
            reference_id: orderId,
            type: 'DYNAMIC',
            currency: 'IDR',
            amount: Number(grossAmount)
        };

        const res = await fetch('https://api.xendit.co/qr_codes', {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(qrisBody)
        });
        const data = await res.json();
        if (!res.ok) {
            console.error(`[XENDIT QRIS ERROR] Response:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, "Gagal membuat QRIS Xendit."));
        }

        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.qr_string)}`;
        return {
            order_id: orderId,
            qr_id: data.id,
            gross_amount: grossAmount,
            payment_type: 'qris',
            actions: [{ name: 'generate-qr-code', url: qrImageUrl }],
            qr_string: data.qr_string,
            transaction_status: 'pending',
            gateway: 'xendit'
        };
    }

    // ------------------------------------------------------------------
    // 3. E-WALLET: GoPay (Redirect Flow)
    // ------------------------------------------------------------------
    if (paymentMethod === 'gopay') {
        const ewalletBody = {
            reference_id: orderId,
            currency: 'IDR',
            amount: Number(grossAmount),
            checkout_method: 'ONE_TIME_PAYMENT',
            channel_code: 'GOPAY',
            channel_properties: {
                // Redirect kembali ke waiting-payment dengan orderId agar
                // animasi sukses ditampilkan sebelum masuk ke /thankyou
                success_redirect_url: `${successRedirectUrl.replace('/app/thankyou', '/app/waiting-payment')}?orderId=${orderId}&paid=true`,
                failure_redirect_url: failedRedirectUrl,
                cancel_redirect_url: failedRedirectUrl
            },
            callback_url: dynamicWebhookUrl,
            metadata: { order_id: orderId }
        };

        const res = await fetch('https://api.xendit.co/ewallets/charges', {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(ewalletBody)
        });
        const data = await res.json();
        if (!res.ok) {
            console.error(`[XENDIT GOPAY ERROR] Response:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, 'Gagal membuat pembayaran GoPay Xendit.'));
        }

        console.log('[XENDIT GOPAY] Actions:', JSON.stringify(data.actions));
        const mobileUrl = data.actions?.mobile_deeplink_checkout_url || data.actions?.mobile_web_checkout_url || '';
        const desktopUrl = data.actions?.desktop_web_checkout_url || '';
        const qrUrl = data.actions?.qr_checkout_url || '';

        return {
            order_id: orderId,
            gross_amount: grossAmount,
            payment_type: 'gopay',
            is_redirect_required: true,
            mobile_url: mobileUrl,
            desktop_url: desktopUrl,
            qr_url: qrUrl,
            actions: [
                { name: 'deeplink-redirect', url: mobileUrl || desktopUrl },
                ...(qrUrl ? [{ name: 'generate-qr-code', url: qrUrl }] : [])
            ],
            transaction_status: 'pending',
            gateway: 'xendit'
        };
    }

    // ------------------------------------------------------------------
    // 4. E-WALLET: ShopeePay (Redirect Flow)
    // ------------------------------------------------------------------
    if (paymentMethod === 'shopeepay') {
        const ewalletBody = {
            reference_id: orderId,
            currency: 'IDR',
            amount: Number(grossAmount),
            checkout_method: 'ONE_TIME_PAYMENT',
            channel_code: 'ID_SHOPEEPAY',
            channel_properties: {
                success_redirect_url: `${successRedirectUrl.replace('/app/thankyou', '/app/waiting-payment')}?orderId=${orderId}&paid=true`,
                failure_redirect_url: failedRedirectUrl,
                cancel_redirect_url: failedRedirectUrl
            },
            callback_url: dynamicWebhookUrl,
            metadata: { order_id: orderId }
        };

        const res = await fetch('https://api.xendit.co/ewallets/charges', {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(ewalletBody)
        });
        const data = await res.json();
        if (!res.ok) {
            console.error(`[XENDIT SHOPEEPAY ERROR] Response:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, 'Gagal membuat pembayaran ShopeePay Xendit.'));
        }

        console.log('[XENDIT SHOPEEPAY] Actions:', JSON.stringify(data.actions));
        const mobileUrl = data.actions?.mobile_deeplink_checkout_url || data.actions?.mobile_web_checkout_url || '';
        const desktopUrl = data.actions?.desktop_web_checkout_url || '';
        const qrUrl = data.actions?.qr_checkout_url || '';

        return {
            order_id: orderId,
            gross_amount: grossAmount,
            payment_type: 'shopeepay',
            is_redirect_required: true,
            mobile_url: mobileUrl,
            desktop_url: desktopUrl,
            qr_url: qrUrl,
            actions: [
                { name: 'deeplink-redirect', url: mobileUrl || desktopUrl },
                ...(qrUrl ? [{ name: 'generate-qr-code', url: qrUrl }] : [])
            ],
            transaction_status: 'pending',
            gateway: 'xendit'
        };
    }

    // ------------------------------------------------------------------
    // 5. E-WALLET: DANA (Redirect Flow)
    // ------------------------------------------------------------------
    if (paymentMethod === 'dana') {
        const ewalletBody = {
            reference_id: orderId,
            currency: 'IDR',
            amount: Number(grossAmount),
            checkout_method: 'ONE_TIME_PAYMENT',
            channel_code: 'ID_DANA',
            channel_properties: {
                success_redirect_url: `${successRedirectUrl.replace('/app/thankyou', '/app/waiting-payment')}?orderId=${orderId}&paid=true`,
                failure_redirect_url: failedRedirectUrl,
                cancel_redirect_url: failedRedirectUrl
            },
            callback_url: dynamicWebhookUrl,
            metadata: { order_id: orderId }
        };

        const res = await fetch('https://api.xendit.co/ewallets/charges', {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(ewalletBody)
        });
        const data = await res.json();
        if (!res.ok) {
            console.error(`[XENDIT DANA ERROR] Response:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, 'Gagal membuat pembayaran DANA Xendit.'));
        }

        console.log('[XENDIT DANA] Actions:', JSON.stringify(data.actions));
        const mobileUrl = data.actions?.mobile_deeplink_checkout_url || data.actions?.mobile_web_checkout_url || '';
        const desktopUrl = data.actions?.desktop_web_checkout_url || '';

        return {
            order_id: orderId,
            gross_amount: grossAmount,
            payment_type: 'dana',
            is_redirect_required: true,
            mobile_url: mobileUrl,
            desktop_url: desktopUrl,
            actions: [{ name: 'deeplink-redirect', url: mobileUrl || desktopUrl }],
            transaction_status: 'pending',
            gateway: 'xendit'
        };
    }

    // ------------------------------------------------------------------
    // 6. E-WALLET: OVO (Push Notification — wajib nomor HP)
    // ------------------------------------------------------------------
    if (paymentMethod === 'ovo') {
        if (!buyerPhone || buyerPhone.trim() === '') {
            throw new Error('Nomor HP wajib diisi untuk pembayaran OVO.');
        }

        let formattedPhone = buyerPhone.trim().replace(/\s|-/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '+62' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+62' + formattedPhone;
        }

        const ewalletBody = {
            reference_id: orderId,
            currency: 'IDR',
            amount: Number(grossAmount),
            checkout_method: 'ONE_TIME_PAYMENT',
            channel_code: 'ID_OVO',
            channel_properties: { mobile_number: formattedPhone },
            callback_url: dynamicWebhookUrl,
            metadata: { order_id: orderId }
        };

        const res = await fetch('https://api.xendit.co/ewallets/charges', {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(ewalletBody)
        });
        const data = await res.json();
        if (!res.ok) {
            console.error(`[XENDIT OVO ERROR] Response:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, 'Gagal membuat pembayaran OVO Xendit.'));
        }

        return {
            order_id: orderId,
            gross_amount: grossAmount,
            payment_type: 'ovo',
            is_redirect_required: false,
            mobile_number: formattedPhone,
            actions: [],
            transaction_status: 'pending',
            gateway: 'xendit'
        };
    }

    // ------------------------------------------------------------------
    // 7. GERAI RETAIL: Indomaret & Alfamart
    // ------------------------------------------------------------------
    if (paymentMethod === 'indomaret' || paymentMethod === 'alfamart') {
        const cstoreBody = {
            external_id: orderId,
            retail_outlet_name: paymentMethod.toUpperCase(),
            name: buyerName || "Pelanggan Primadev",
            expected_amount: grossAmount,
            is_single_use: true
        };

        const res = await fetch('https://api.xendit.co/fixed_payment_code', {
            method: 'POST',
            headers: commonHeaders,
            body: JSON.stringify(cstoreBody)
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || data.error_code || `Gagal membuat kode pembayaran ${paymentMethod} Xendit.`);
        }

        return {
            order_id: orderId,
            gross_amount: grossAmount,
            payment_type: 'cstore',
            store: paymentMethod,
            payment_code: data.payment_code,
            transaction_status: 'pending',
            gateway: 'xendit'
        };
    }

    throw new Error(`Metode pembayaran "${paymentMethod}" belum didukung.`);
};

// =====================================================================
// MAIN HANDLER
// =====================================================================
exports.handler = async (event, context) => {
    // CORS — dibatasi ke domain resmi
    const allowedOrigins = [
        'https://apps-primadev.netlify.app',
        'https://primadev.netlify.app',
        process.env.ALLOWED_ORIGIN || ''
    ].filter(Boolean);
    const requestOrigin = event.headers.origin || event.headers.Origin || '';
    const corsOrigin = (allowedOrigins.includes(requestOrigin) || !requestOrigin)
        ? (requestOrigin || allowedOrigins[0])
        : allowedOrigins[0];

    const headers = {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Vary': 'Origin'
    };

    const db = getDb();
    let PRICING_DB = {};

    // Hitung URL webhook & redirect secara dinamis
    const host = event.headers.host || event.headers.Host || 'apps-primadev.netlify.app';
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    const originUrl = `${proto}://${host}`;

    // Xendit menolak URL localhost — fallback ke domain publik
    const publicOriginForWebhook = isLocalhost
        ? (process.env.PUBLIC_ORIGIN_URL || 'https://apps-primadev.netlify.app')
        : originUrl;
    const dynamicWebhookUrl = `${publicOriginForWebhook}/.netlify/functions/webhook`;
    const successRedirectUrl = `${originUrl}/app/thankyou`;
    const failedRedirectUrl = `${originUrl}/app/checkout`;

    // Load produk dari Firebase
    if (db) {
        try {
            const prodSnap = await db.ref('products').once('value');
            if (prodSnap.exists()) PRICING_DB = prodSnap.val();
        } catch (e) {
            console.error("Failed to load products from Firebase:", e.message);
        }
    }

    // Fallback ke products.json lokal
    if (Object.keys(PRICING_DB).length === 0) {
        try {
            PRICING_DB = require('../../products.json');
            console.log("✅ Using fallback local products.json");
        } catch (e) {
            console.error("❌ Failed to load local products.json fallback:", e.message);
        }
    }

    // GET — Katalog & config publik
    if (event.httpMethod === 'GET') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                catalog: PRICING_DB,
                xenditPublicKey: XENDIT_PUBLIC_KEY,
                gateway: 'xendit'
            })
        };
    }

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { action } = body;

        console.log(`[BACKEND] Action: ${action || 'None'} | Method: ${event.httpMethod}`);

        // ==============================================================
        // ACTION: create_transaction (Checkout / Pembelian Baru)
        // ==============================================================
        if (action === 'create_transaction') {
            let { appId, duration, buyerName, buyerEmail, buyerPhone, paymentMethod } = body;

            if (!appId || typeof appId !== 'string' || appId.length > 64) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "appId tidak valid" }) };
            }
            if (!duration || !['monthly', 'yearly', 'lifetime'].includes(duration)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Durasi tidak valid" }) };
            }
            if (!paymentMethod || typeof paymentMethod !== 'string' || paymentMethod.length > 32) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Metode pembayaran tidak valid" }) };
            }
            if (!buyerName || typeof buyerName !== 'string' || buyerName.length > 128) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Nama pembeli tidak valid" }) };
            }
            if (!buyerEmail || typeof buyerEmail !== 'string' || !buyerEmail.includes('@') || buyerEmail.length > 254) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Email pembeli tidak valid" }) };
            }
            buyerPhone = (buyerPhone && typeof buyerPhone === 'string') ? buyerPhone.substring(0, 20) : "";

            const product = PRICING_DB[appId];
            if (!product || !product.price[duration]) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Produk tidak tersedia" }) };
            }

            const price = Math.floor(product.price[duration]);
            if (!price || price <= 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Harga produk tidak valid" }) };
            }

            const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            try {
                const xenditResponse = await executeXenditCharge(
                    { orderId, grossAmount: price, buyerName, buyerEmail, buyerPhone, paymentMethod },
                    process.env.XENDIT_SECRET_KEY,
                    dynamicWebhookUrl,
                    successRedirectUrl,
                    failedRedirectUrl
                );
                console.log("[BACKEND] Xendit Charge Success:", JSON.stringify(xenditResponse));

                if (db) {
                    await db.ref(`transactions/${orderId}`).set({
                        orderId,
                        status: 'pending',
                        amount: price,
                        customerName: buyerName,
                        customerEmail: buyerEmail,
                        customerPhone: buyerPhone,
                        appName: product.name,
                        appId,
                        duration,
                        orderType: 'NEW',
                        paymentMethod,
                        gateway: 'xendit',
                        createdAt: Date.now()
                    });
                }

                return { statusCode: 200, headers, body: JSON.stringify(xenditResponse) };

            } catch (xenditError) {
                console.error("[BACKEND] Xendit Charge Failed:", xenditError.message);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: "Xendit Error: " + xenditError.message })
                };
            }
        }

        // ==============================================================
        // ACTION: renew_transaction (Perpanjangan Lisensi)
        // ==============================================================
        if (action === 'renew_transaction') {
            const { licenseKey, duration, buyerName, buyerEmail, buyerPhone, paymentMethod } = body;

            if (!licenseKey || !duration || !buyerName || !buyerEmail || !paymentMethod) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Data tidak lengkap untuk renewal' }) };
            }
            if (typeof licenseKey !== 'string' || licenseKey.length > 64) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Format license key tidak valid' }) };
            }
            if (!['monthly', 'yearly', 'lifetime'].includes(duration)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Durasi tidak valid' }) };
            }

            if (!db) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database tidak terhubung' }) };
            }
            const licSnap = await db.ref(`licenses/${licenseKey}`).once('value');
            if (!licSnap.exists()) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'License Key tidak ditemukan di sistem' }) };
            }
            const licenseData = licSnap.val();

            const appId = licenseData.appId;
            const product = PRICING_DB[appId];
            let amount = 0;
            if (product && product.price && product.price[duration]) {
                amount = Math.floor(product.price[duration]);
            } else {
                amount = duration === 'yearly' ? 860000 : 80000;
            }

            const orderId = `RENEW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const appName = licenseData.appName || product?.name || 'Lisensi Primadev';

            try {
                const xenditResponse = await executeXenditCharge(
                    { orderId, grossAmount: amount, buyerName, buyerEmail, buyerPhone: buyerPhone || '', paymentMethod },
                    process.env.XENDIT_SECRET_KEY,
                    dynamicWebhookUrl,
                    successRedirectUrl,
                    failedRedirectUrl
                );
                console.log('[BACKEND] Renewal Xendit Charge Success:', orderId);

                if (db) {
                    await db.ref(`transactions/${orderId}`).set({
                        orderId,
                        status: 'pending',
                        amount,
                        customerName: buyerName,
                        customerEmail: buyerEmail,
                        appName,
                        appId: licenseData?.appId || '',
                        duration,
                        orderType: 'RENEWAL',
                        targetLicenseKey: licenseKey,
                        paymentMethod,
                        gateway: 'xendit',
                        createdAt: Date.now()
                    });
                }

                return { statusCode: 200, headers, body: JSON.stringify(xenditResponse) };

            } catch (xenditErr) {
                console.error('[BACKEND] Renewal Xendit Charge Failed:', xenditErr.message);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: "Xendit Error: " + xenditErr.message })
                };
            }
        }

        // ==============================================================
        // ACTION: verify_payment (Polling dari frontend)
        // ==============================================================
        if (action === 'verify_payment') {
            const { orderId } = body;
            if (!orderId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing orderId" }) };
            if (!db) return { statusCode: 500, headers, body: JSON.stringify({ error: "Database offline" }) };

            const trxSnap = await db.ref(`transactions/${orderId}`).once('value');
            if (!trxSnap.exists()) {
                console.error(`[BACKEND] Data transaksi ${orderId} tidak ada di Firebase!`);
                return { statusCode: 404, headers, body: JSON.stringify({ error: "Transaction data not found" }) };
            }
            const trxData = trxSnap.val();

            if (trxData.status === 'success') {
                return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', message: "Already processed" }) };
            }

            const PAID_STATUSES = ['PAID', 'SUCCEEDED', 'COMPLETED', 'settlement', 'capture'];
            const isPaid = PAID_STATUSES.includes(trxData.status);

            if (!isPaid) {
                console.log(`[BACKEND] Polling verify: ${orderId} | Status saat ini: "${trxData.status}" → masih pending`);
                return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending', isSuccess: false }) };
            }

            console.log(`[BACKEND] verify_payment FALLBACK: webhook belum proses, proses sekarang. Status: ${trxData.status}`);

            // --- PERPANJANGAN (RENEWAL) ---
            if (trxData.orderType === 'RENEWAL') {
                const targetKey = trxData.targetLicenseKey;
                if (!targetKey) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: "Target License Key missing" }) };
                }

                const licRef = db.ref(`licenses/${targetKey}`);
                const licSnap = await licRef.once('value');
                if (!licSnap.exists()) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: "License not found" }) };
                }

                const currentData = licSnap.val();
                const now = new Date();
                let currentExpiry = currentData.expiryDate ? new Date(currentData.expiryDate) : null;
                if (currentExpiry && isNaN(currentExpiry.getTime())) currentExpiry = null;

                let baseDate = (currentExpiry && currentExpiry > now) ? currentExpiry : now;
                let newExpiry = new Date(baseDate);
                if (trxData.duration === 'yearly') newExpiry.setFullYear(newExpiry.getFullYear() + 1);
                else newExpiry.setMonth(newExpiry.getMonth() + 1);

                const expiryString = newExpiry.toISOString().split('T')[0];
                await licRef.update({
                    status: 'active',
                    expiryDate: expiryString,
                    lastRenewalDate: Date.now(),
                    lastTransactionId: orderId
                });
                await db.ref(`transactions/${orderId}`).update({ status: 'success' });

                await sendEmail({
                    name: currentData.name,
                    email: currentData.email,
                    key: targetKey,
                    appName: currentData.appName,
                    expiryDate: expiryString,
                    transactionId: orderId
                }, true);

                return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', key: targetKey }) };
            }

            // --- PEMBELIAN BARU ---
            const appId = trxData.appId || '';
            const duration = trxData.duration || 'monthly';
            const product = PRICING_DB[appId] || { name: 'Aplikasi', price: {} };
            const finalBuyerName = trxData.customerName || 'Customer';
            const finalBuyerEmail = trxData.customerEmail || 'no-reply@primadev.com';

            const key = generateRandomKey();
            const expiry = new Date();
            if (duration === 'monthly') expiry.setMonth(expiry.getMonth() + 1);
            else if (duration === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1);
            else expiry.setFullYear(expiry.getFullYear() + 100);

            const newLicense = {
                key,
                status: 'active',
                type: duration,
                appName: product.name || trxData.appName || 'Aplikasi',
                appId,
                package: product.package || '',
                price: trxData.amount || 0,
                name: finalBuyerName,
                email: finalBuyerEmail,
                expiryDate: expiry.toISOString().split('T')[0],
                paymentMethod: trxData.paymentMethod || 'Xendit',
                transactionId: orderId,
                createdAt: Date.now()
            };

            await db.ref(`licenses/${key}`).set(newLicense);
            await db.ref(`transactions/${orderId}`).update({ status: 'success' });
            await sendEmail({ ...newLicense, key });

            return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', key }) };
        }

        // ==============================================================
        // ACTION: validate_extension_license
        // Dipanggil oleh browser extension saat user mengisi form aktivasi.
        // Memvalidasi: licenseKey ada? name cocok? email cocok? aktif? belum expired?
        // ==============================================================
        if (action === 'validate_extension_license') {
            const { licenseKey, name, email } = body;

            if (!licenseKey || !name || !email) {
                return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Data tidak lengkap. Isi Nama, Email, dan License Key.' }) };
            }
            if (typeof licenseKey !== 'string' || licenseKey.length > 64) {
                return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Format license key tidak valid.' }) };
            }
            if (!db) {
                return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Koneksi database gagal. Coba lagi.' }) };
            }

            // Lookup license di Firebase
            const licSnap = await db.ref(`licenses/${licenseKey}`).once('value');
            if (!licSnap.exists()) {
                return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'License key tidak ditemukan.' }) };
            }

            const lic = licSnap.val();

            // Validasi nama & email (case-insensitive, trim whitespace)
            const nameMatch = (lic.name || '').toLowerCase().trim() === name.toLowerCase().trim();
            const emailMatch = (lic.email || '').toLowerCase().trim() === email.toLowerCase().trim();

            if (!nameMatch || !emailMatch) {
                return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Nama atau email tidak cocok dengan data pembelian.' }) };
            }

            // Cek status aktif
            if (lic.status !== 'active') {
                const statusMsg = lic.status === 'expired' ? 'Lisensi sudah kedaluwarsa.' : 'Lisensi tidak aktif atau dinonaktifkan.';
                return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: statusMsg }) };
            }

            // Cek expiry date (jika bukan lifetime)
            if (lic.expiryDate && lic.expiryDate !== 'Seumur Hidup') {
                const expiry = new Date(lic.expiryDate);
                if (!isNaN(expiry) && expiry < new Date()) {
                    // Auto-update status ke expired di Firebase
                    await db.ref(`licenses/${licenseKey}`).update({ status: 'expired' });
                    return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Lisensi Anda sudah kedaluwarsa. Silakan perpanjang.' }) };
                }
            }

            // ✅ Semua validasi lulus
            console.log(`[EXTENSION] License valid: ${licenseKey} untuk ${email}`);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    valid: true,
                    appName: lic.appName || 'Primadev Extension',
                    expiryDate: lic.expiryDate || 'Seumur Hidup',
                    type: lic.type || 'extension',
                    holderName: lic.name
                })
            };
        }

        // Endpoint legacy diblokir
        if (!action) {
            console.warn("[SECURITY] Request tanpa action diblokir.");
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Endpoint tidak aktif." }) };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid action" }) };


    } catch (error) {
        console.error("Backend Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || "Internal error" }) };
    }
};
