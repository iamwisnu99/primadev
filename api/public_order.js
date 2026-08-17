const admin = require('firebase-admin');
const fetch = require('node-fetch');

const XENDIT_PUBLIC_KEY = process.env.XENDIT_PUBLIC_KEY || '';
const { getPremiumTemplate, getRenewalTemplate } = require('../utils/email_template');

console.log("[INIT] Mode gateway ganda aktif: Xendit + Midtrans");
console.log("[INIT] Status XENDIT_SECRET_KEY:", !!process.env.XENDIT_SECRET_KEY);
console.log("[INIT] Status XENDIT_PUBLIC_KEY:", !!XENDIT_PUBLIC_KEY);
console.log("[INIT] Status MIDTRANS_SERVER_KEY:", !!process.env.MIDTRANS_SERVER_KEY);
console.log("[INIT] Status MIDTRANS_CLIENT_KEY:", !!process.env.MIDTRANS_CLIENT_KEY);
console.log("[INIT] Mode Midtrans:", process.env.MIDTRANS_IS_PRODUCTION === 'true' ? 'PRODUCTION' : 'SANDBOX (default)');

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
                console.log("[INIT] File konfigurasi Firebase lokal tidak ditemukan.");
            }
        }
    } catch (err) {
        console.error("[INIT] Gagal memproses kredensial Firebase:", err.message);
    }

    const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app";
    if (serviceAccount && (serviceAccount.privateKey || serviceAccount.private_key)) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: dbUrl
            });
            console.log("[INIT] Firebase Admin berhasil diinisialisasi.");
        } catch (initErr) {
            console.error("[INIT] Inisialisasi Firebase Admin gagal:", initErr.message);
        }
    } else {
        console.error("[INIT] Kredensial Firebase tidak tersedia atau tidak valid.");
    }
}

const getDb = () => {
    if (admin.apps.length) return admin.database();
    return null;
};

const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return `PRIMA-${Array.from({ length: 3 }, () =>
        Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    ).join('-')}`;
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
        appName: data.appName,
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

    console.log(`[XENDIT] Memproses charge | OrderID: ${orderId} | Metode: ${paymentMethod} | Jumlah: ${grossAmount}`);

    const formatXenditError = (data, defaultMsg) => {
        let errMsg = data.message || data.error_code || defaultMsg;
        if (Array.isArray(data.errors) && data.errors.length > 0) {
            const detailedList = data.errors.map(e => `${e.path || e.field || ''}: ${e.message}`).join(' | ');
            errMsg = `${errMsg} (${detailedList})`;
        }
        return errMsg;
    };

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
            console.error(`[XENDIT] Gagal membuat Virtual Account | Respons:`, JSON.stringify(data));
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
            console.error(`[XENDIT] Gagal membuat QRIS | Respons:`, JSON.stringify(data));
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

    if (paymentMethod === 'gopay') {
        const ewalletBody = {
            reference_id: orderId,
            currency: 'IDR',
            amount: Number(grossAmount),
            checkout_method: 'ONE_TIME_PAYMENT',
            channel_code: 'GOPAY',
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
            console.error(`[XENDIT] Gagal membuat pembayaran GoPay | Respons:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, 'Gagal membuat pembayaran GoPay Xendit.'));
        }

        console.log('[XENDIT] GoPay actions diterima:', JSON.stringify(data.actions));
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
            console.error(`[XENDIT] Gagal membuat pembayaran ShopeePay | Respons:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, 'Gagal membuat pembayaran ShopeePay Xendit.'));
        }

        console.log('[XENDIT] ShopeePay actions diterima:', JSON.stringify(data.actions));
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
            console.error(`[XENDIT] Gagal membuat pembayaran DANA | Respons:`, JSON.stringify(data));
            throw new Error(formatXenditError(data, 'Gagal membuat pembayaran DANA Xendit.'));
        }

        console.log('[XENDIT] DANA actions diterima:', JSON.stringify(data.actions));
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
            console.error(`[XENDIT] Gagal membuat pembayaran OVO | Respons:`, JSON.stringify(data));
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

    throw new Error(`Metode pembayaran "${paymentMethod}" belum didukung oleh Xendit.`);
};

const getActiveGateway = async (db) => {
    if (!db) return 'xendit';
    try {
        const snap = await db.ref('settings/payment_gateway/active_gateway').once('value');
        const val = snap.val();
        return (val === 'midtrans' || val === 'xendit') ? val : 'xendit';
    } catch (err) {
        console.error('[GATEWAY] Gagal membaca pengaturan gateway dari Firebase, menggunakan xendit sebagai fallback:', err.message);
        return 'xendit';
    }
};

const executeMidtransCharge = async (payload, serverKey, isProduction, finishUrl) => {
    if (!serverKey) {
        throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi di file .env server.');
    }

    const { orderId, grossAmount, buyerName, buyerEmail, buyerPhone, paymentMethod, productName, appId } = payload;

    const baseUrl = isProduction
        ? 'https://api.midtrans.com/v2/charge'
        : 'https://api.sandbox.midtrans.com/v2/charge';

    const authHeader = 'Basic ' + Buffer.from(serverKey + ':').toString('base64');
    const reqHeaders = {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    console.log(`[MIDTRANS] Memproses charge | OrderID: ${orderId} | Metode: ${paymentMethod} | Jumlah: ${grossAmount} | Lingkungan: ${isProduction ? 'PRODUCTION' : 'SANDBOX'}`);

    const transactionDetails = {
        order_id: orderId,
        gross_amount: Number(grossAmount)
    };

    const nameParts = (buyerName || 'Pelanggan').split(' ');
    const customerDetails = {
        first_name: nameParts[0] || 'Pelanggan',
        last_name: nameParts.slice(1).join(' ') || '',
        email: buyerEmail || 'customer@primadev.com',
        phone: buyerPhone || ''
    };

    const itemDetails = [{
        id: appId || 'primadev-license',
        price: Number(grossAmount),
        quantity: 1,
        name: (productName || 'Lisensi Primadev').substring(0, 50)
    }];

    const formatMidtransError = (data, defaultMsg) => {
        return data.status_message ||
            (Array.isArray(data.error_messages) ? data.error_messages.join(', ') : null) ||
            defaultMsg;
    };

    const chargeAndCheck = async (body, errContext) => {
        const res = await fetch(baseUrl, { method: 'POST', headers: reqHeaders, body: JSON.stringify(body) });
        const data = await res.json();
        const isOk = ['200', '201'].includes(String(data.status_code));
        if (!isOk) {
            console.error(`[MIDTRANS] Gagal memproses ${errContext} | Respons:`, JSON.stringify(data));
            throw new Error(formatMidtransError(data, `Gagal membuat ${errContext} via Midtrans.`));
        }
        return data;
    };

    if (['bca', 'bni', 'bri', 'permata'].includes(paymentMethod)) {
        const data = await chargeAndCheck({
            payment_type: 'bank_transfer',
            transaction_details: transactionDetails,
            customer_details: customerDetails,
            item_details: itemDetails,
            bank_transfer: { bank: paymentMethod }
        }, `VA ${paymentMethod.toUpperCase()}`);

        const vaNumber = data.va_numbers?.[0]?.va_number || data.permata_va_number || '';
        return {
            order_id: orderId, gross_amount: grossAmount,
            payment_type: 'bank_transfer',
            va_numbers: [{ bank: paymentMethod, va_number: vaNumber }],
            transaction_status: 'pending', gateway: 'midtrans'
        };
    }

    if (paymentMethod === 'mandiri') {
        const data = await chargeAndCheck({
            payment_type: 'echannel',
            transaction_details: transactionDetails,
            customer_details: customerDetails,
            item_details: itemDetails,
            echannel: {
                bill_info1: 'Pembayaran Lisensi',
                bill_info2: (productName || 'Primadev').substring(0, 20)
            }
        }, 'VA Mandiri');

        return {
            order_id: orderId, gross_amount: grossAmount,
            payment_type: 'bank_transfer',
            va_numbers: [{ bank: 'mandiri', va_number: data.bill_key || '' }],
            biller_code: data.biller_code || '',
            transaction_status: 'pending', gateway: 'midtrans'
        };
    }

    if (paymentMethod === 'qris') {
        const data = await chargeAndCheck({
            payment_type: 'qris',
            transaction_details: transactionDetails,
            customer_details: customerDetails,
            item_details: itemDetails,
            qris: { acquirer: 'gopay' }
        }, 'QRIS');

        const qrString = data.qr_string || '';
        const qrDisplayUrl = qrString
            ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrString)}`
            : '';

        return {
            order_id: orderId, gross_amount: grossAmount,
            payment_type: 'qris',
            actions: [{ name: 'generate-qr-code', url: qrDisplayUrl }],
            qr_string: qrString,
            transaction_status: 'pending', gateway: 'midtrans'
        };
    }

    if (paymentMethod === 'gopay') {
        const data = await chargeAndCheck({
            payment_type: 'gopay',
            transaction_details: transactionDetails,
            customer_details: customerDetails,
            item_details: itemDetails,
            gopay: { enable_callback: true, callback_url: finishUrl }
        }, 'GoPay');

        const actions = data.actions || [];
        const qrAction = actions.find(a => a.name === 'generate-qr-code');
        const deeplinkAction = actions.find(a => a.name === 'deeplink-redirect');
        const mobileUrl = deeplinkAction?.url || '';
        const qrUrl = qrAction?.url || '';

        return {
            order_id: orderId, gross_amount: grossAmount,
            payment_type: 'gopay', is_redirect_required: true,
            mobile_url: mobileUrl, desktop_url: '', qr_url: qrUrl,
            actions: [
                ...(mobileUrl ? [{ name: 'deeplink-redirect', url: mobileUrl }] : []),
                ...(qrUrl ? [{ name: 'generate-qr-code', url: qrUrl }] : [])
            ],
            transaction_status: 'pending', gateway: 'midtrans'
        };
    }

    if (paymentMethod === 'shopeepay') {
        const data = await chargeAndCheck({
            payment_type: 'shopeepay',
            transaction_details: transactionDetails,
            customer_details: customerDetails,
            item_details: itemDetails,
            shopeepay: { callback_url: finishUrl }
        }, 'ShopeePay');

        const deeplinkAction = (data.actions || []).find(a => a.name === 'deeplink-redirect');
        const mobileUrl = deeplinkAction?.url || '';

        return {
            order_id: orderId, gross_amount: grossAmount,
            payment_type: 'shopeepay', is_redirect_required: true,
            mobile_url: mobileUrl, desktop_url: '', qr_url: '',
            actions: mobileUrl ? [{ name: 'deeplink-redirect', url: mobileUrl }] : [],
            transaction_status: 'pending', gateway: 'midtrans'
        };
    }

    if (paymentMethod === 'dana') {
        const data = await chargeAndCheck({
            payment_type: 'dana',
            transaction_details: transactionDetails,
            customer_details: customerDetails,
            item_details: itemDetails,
            dana: { callback_url: finishUrl }
        }, 'DANA');

        const deeplinkAction = (data.actions || []).find(a => a.name === 'deeplink-redirect');
        const mobileUrl = deeplinkAction?.url || '';

        return {
            order_id: orderId, gross_amount: grossAmount,
            payment_type: 'dana', is_redirect_required: true,
            mobile_url: mobileUrl, desktop_url: '',
            actions: mobileUrl ? [{ name: 'deeplink-redirect', url: mobileUrl }] : [],
            transaction_status: 'pending', gateway: 'midtrans'
        };
    }

    if (paymentMethod === 'ovo') {
        if (!buyerPhone) throw new Error('Nomor HP wajib diisi untuk pembayaran OVO.');
        let formattedPhone = buyerPhone.trim().replace(/\s|-/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '+62' + formattedPhone.substring(1);
        else if (!formattedPhone.startsWith('+')) formattedPhone = '+62' + formattedPhone;

        await chargeAndCheck({
            payment_type: 'ovo',
            transaction_details: transactionDetails,
            customer_details: { ...customerDetails, phone: formattedPhone },
            item_details: itemDetails
        }, 'OVO');

        return {
            order_id: orderId, gross_amount: grossAmount,
            payment_type: 'ovo', is_redirect_required: false,
            mobile_number: formattedPhone, actions: [],
            transaction_status: 'pending', gateway: 'midtrans'
        };
    }

    if (paymentMethod === 'indomaret' || paymentMethod === 'alfamart') {
        const storeName = paymentMethod === 'indomaret' ? 'Indomaret' : 'Alfamart';
        const data = await chargeAndCheck({
            payment_type: 'cstore',
            transaction_details: transactionDetails,
            customer_details: customerDetails,
            item_details: itemDetails,
            cstore: { store: storeName, message: 'Pembayaran Lisensi Primadev' }
        }, storeName);

        return {
            order_id: orderId, gross_amount: grossAmount,
            payment_type: 'cstore', store: paymentMethod,
            payment_code: data.payment_code || '',
            transaction_status: 'pending', gateway: 'midtrans'
        };
    }

    throw new Error(`Metode pembayaran "${paymentMethod}" belum didukung oleh Midtrans.`);
};

const netlifyHandler = async (event, context) => {
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
    let PORTFOLIO_DB = {};

    const host = event.headers.host || event.headers.Host || 'apps-primadev.netlify.app';
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    const originUrl = `${proto}://${host}`;

    const publicOriginForWebhook = isLocalhost
        ? (process.env.PUBLIC_ORIGIN_URL || 'https://apps-primadev.netlify.app')
        : originUrl;
    const dynamicWebhookUrl = `${publicOriginForWebhook}/.netlify/functions/webhook`;
    const successRedirectUrl = `${originUrl}/app/thankyou`;
    const failedRedirectUrl = `${originUrl}/app/checkout`;

    if (db) {
        try {
            const prodSnap = await db.ref('products').once('value');
            if (prodSnap.exists()) PRICING_DB = prodSnap.val();
            
            const portSnap = await db.ref('portfolio').once('value');
            if (portSnap.exists()) PORTFOLIO_DB = portSnap.val();
        } catch (e) {
            console.error("[BACKEND] Gagal memuat data dari Firebase:", e.message);
        }
    }

    if (Object.keys(PRICING_DB).length === 0) {
        try {
            PRICING_DB = require('../../products.json');
            console.log("[BACKEND] Menggunakan fallback products.json dari lokal.");
        } catch (e) {
            console.error("[BACKEND] Gagal memuat fallback products.json:", e.message);
        }
    }

    if (event.httpMethod === 'GET') {
        const activeGw = await getActiveGateway(db);

        // Buang properti berat (base64, source_code, dsb) agar tidak melebihi 6MB Netlify limit
        const safeCatalog = {};
        for (const [key, val] of Object.entries(PRICING_DB)) {
            const safeVal = { ...val };
            delete safeVal.source_code;
            delete safeVal.screenshots;
            delete safeVal.base64;
            safeCatalog[key] = safeVal;
        }

        const safePortfolio = {};
        for (const [key, val] of Object.entries(PORTFOLIO_DB)) {
            const safeVal = { ...val };
            delete safeVal.images; 
            delete safeVal.screenshots;
            delete safeVal.base64;
            safePortfolio[key] = safeVal;
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                catalog: safeCatalog,
                portfolio: safePortfolio,
                xenditPublicKey: XENDIT_PUBLIC_KEY,
                midtransClientKey: process.env.MIDTRANS_CLIENT_KEY || '',
                activeGateway: activeGw
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

        console.log(`[BACKEND] Permintaan masuk | Action: ${action || 'tidak ada'} | Metode: ${event.httpMethod}`);

        if (action === 'create_transaction') {
            let { appId, duration, buyerName, buyerEmail, buyerPhone, paymentMethod } = body;

            if (!appId || typeof appId !== 'string' || appId.length > 64) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Format appId tidak valid" }) };
            }
            if (!duration || !['monthly', 'yearly', 'lifetime'].includes(duration)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Durasi tidak valid. Harus: monthly, yearly, atau lifetime" }) };
            }

            const ALLOWED_METHODS = ['qris', 'bca', 'bni', 'bri', 'permata', 'mandiri', 'cimb', 'gopay', 'shopeepay', 'dana', 'ovo', 'indomaret', 'alfamart'];
            if (!paymentMethod || typeof paymentMethod !== 'string' || !ALLOWED_METHODS.includes(paymentMethod.toLowerCase())) {
                console.warn(`[BACKEND] Metode pembayaran ditolak: "${paymentMethod}"`);
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Metode pembayaran tidak dikenal" }) };
            }
            paymentMethod = paymentMethod.toLowerCase();

            if (!buyerName || typeof buyerName !== 'string' || buyerName.length > 128) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Nama pembeli tidak valid" }) };
            }
            if (!buyerEmail || typeof buyerEmail !== 'string' || !buyerEmail.includes('@') || buyerEmail.length > 254) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Email pembeli tidak valid" }) };
            }
            buyerPhone = (buyerPhone && typeof buyerPhone === 'string') ? buyerPhone.substring(0, 20) : "";

            const product = PRICING_DB[appId];
            if (!product || !product.price || !product.price[duration]) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Produk atau paket harga tidak tersedia" }) };
            }

            const price = Math.floor(product.price[duration]);
            if (!price || price <= 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Harga produk tidak valid di sistem" }) };
            }

            const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            const activeGateway = await getActiveGateway(db);
            console.log(`[BACKEND] Transaksi baru | Gateway: ${activeGateway} | OrderID: ${orderId} | Produk: ${appId} | Durasi: ${duration} | Jumlah: ${price}`);

            try {
                let chargeResponse;

                if (activeGateway === 'midtrans') {
                    chargeResponse = await executeMidtransCharge(
                        { orderId, grossAmount: price, buyerName, buyerEmail, buyerPhone, paymentMethod, productName: product.name, appId },
                        process.env.MIDTRANS_SERVER_KEY,
                        process.env.MIDTRANS_IS_PRODUCTION === 'true',
                        successRedirectUrl
                    );
                    console.log(`[BACKEND] Charge Midtrans berhasil | OrderID: ${orderId}`);
                } else {
                    chargeResponse = await executeXenditCharge(
                        { orderId, grossAmount: price, buyerName, buyerEmail, buyerPhone, paymentMethod },
                        process.env.XENDIT_SECRET_KEY,
                        dynamicWebhookUrl,
                        successRedirectUrl,
                        failedRedirectUrl
                    );
                    console.log(`[BACKEND] Charge Xendit berhasil | OrderID: ${orderId}`);
                }

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
                        gateway: activeGateway,
                        createdAt: Date.now()
                    });
                }

                return { statusCode: 200, headers, body: JSON.stringify(chargeResponse) };

            } catch (chargeError) {
                console.error(`[BACKEND] Charge ${activeGateway} gagal | OrderID: ${orderId} | Error: ${chargeError.message}`);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: chargeError.message })
                };
            }
        }

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

            const activeGatewayRenew = await getActiveGateway(db);
            console.log(`[BACKEND] Perpanjangan lisensi | Gateway: ${activeGatewayRenew} | OrderID: ${orderId} | Kunci: ${licenseKey}`);

            try {
                let chargeResponseRenew;

                if (activeGatewayRenew === 'midtrans') {
                    chargeResponseRenew = await executeMidtransCharge(
                        { orderId, grossAmount: amount, buyerName, buyerEmail, buyerPhone: buyerPhone || '', paymentMethod, productName: appName, appId: licenseData?.appId || '' },
                        process.env.MIDTRANS_SERVER_KEY,
                        process.env.MIDTRANS_IS_PRODUCTION === 'true',
                        successRedirectUrl
                    );
                    console.log(`[BACKEND] Charge Midtrans untuk perpanjangan berhasil | OrderID: ${orderId}`);
                } else {
                    chargeResponseRenew = await executeXenditCharge(
                        { orderId, grossAmount: amount, buyerName, buyerEmail, buyerPhone: buyerPhone || '', paymentMethod },
                        process.env.XENDIT_SECRET_KEY,
                        dynamicWebhookUrl,
                        successRedirectUrl,
                        failedRedirectUrl
                    );
                    console.log(`[BACKEND] Charge Xendit untuk perpanjangan berhasil | OrderID: ${orderId}`);
                }

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
                        gateway: activeGatewayRenew,
                        createdAt: Date.now()
                    });
                }

                return { statusCode: 200, headers, body: JSON.stringify(chargeResponseRenew) };

            } catch (renewErr) {
                console.error(`[BACKEND] Charge ${activeGatewayRenew} untuk perpanjangan gagal | OrderID: ${orderId} | Error: ${renewErr.message}`);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: renewErr.message })
                };
            }
        }

        if (action === 'verify_payment') {
            const { orderId } = body;
            if (!orderId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing orderId" }) };
            if (!db) return { statusCode: 500, headers, body: JSON.stringify({ error: "Database offline" }) };

            const trxSnap = await db.ref(`transactions/${orderId}`).once('value');
            if (!trxSnap.exists()) {
                console.error(`[BACKEND] Data transaksi tidak ditemukan di Firebase | OrderID: ${orderId}`);
                return { statusCode: 404, headers, body: JSON.stringify({ error: "Data transaksi tidak ditemukan" }) };
            }
            const trxData = trxSnap.val();

            if (trxData.status === 'success') {
                return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', message: "Already processed" }) };
            }

            const PAID_STATUSES = ['PAID', 'SUCCEEDED', 'COMPLETED', 'settlement', 'capture'];
            const isPaid = PAID_STATUSES.includes(trxData.status);

            if (!isPaid) {
                console.log(`[BACKEND] Polling verifikasi | OrderID: ${orderId} | Status Lokal: "${trxData.status}" | Memeriksa Gateway...`);
                let gatewayStatus = null;
                try {
                    if (trxData.gateway === 'midtrans') {
                        const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';
                        const baseUrl = isProd ? 'https://api.midtrans.com/v2' : 'https://api.sandbox.midtrans.com/v2';
                        const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
                        if (serverKey) {
                            const res = await fetch(`${baseUrl}/${orderId}/status`, {
                                headers: {
                                    'Accept': 'application/json',
                                    'Content-Type': 'application/json',
                                    'Authorization': `Basic ${Buffer.from(serverKey + ':').toString('base64')}`
                                }
                            });
                            if (res.ok) {
                                const mData = await res.json();
                                const ts = (mData.transaction_status || '').toLowerCase();
                                const fs = (mData.fraud_status || '').toLowerCase();
                                if (fs !== 'deny' && (ts === 'capture' || ts === 'settlement')) {
                                    gatewayStatus = 'success';
                                    console.log(`[BACKEND] Active polling mendeteksi pembayaran Midtrans berhasil! OrderID: ${orderId}`);
                                }
                            }
                        }
                    } else if (trxData.gateway === 'xendit') {
                    }
                } catch (e) {
                    console.error("[ACTIVE POLLING] Error:", e.message);
                }

                if (gatewayStatus !== 'success') {
                    return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending', isSuccess: false }) };
                }
            }

            console.log(`[BACKEND] Fallback verifikasi | Webhook belum diproses | OrderID: ${orderId} | Status: ${trxData.status}`);

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

        if (action === 'validate_extension_license') {
            return {
                statusCode: 301,
                headers: {
                    ...headers,
                    'Location': '/.netlify/functions/validate-license'
                },
                body: JSON.stringify({
                    error: 'Endpoint ini sudah dipindahkan.',
                    newEndpoint: '/.netlify/functions/validate-license',
                    method: 'POST',
                    note: 'Gunakan endpoint baru untuk validasi license extension.'
                })
            };
        }

        if (!action) {
            console.warn("[BACKEND] Permintaan tanpa action diblokir oleh sistem keamanan.");
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Endpoint tidak aktif." }) };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid action" }) };


    } catch (error) {
        console.error("[BACKEND] Terjadi kesalahan server:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || "Internal error" }) };
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
