const admin = require('firebase-admin');
const fetch = require('node-fetch');
const midtransClient = require('midtrans-client');

const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;

const { getPremiumTemplate, getRenewalTemplate } = require('./email_template')

console.log("[INIT] Midtrans Configuration:");
console.log("[INIT] - IS_PRODUCTION:", IS_PRODUCTION);
console.log("[INIT] - SERVER_KEY set:", !!SERVER_KEY);
console.log("[INIT] - CLIENT_KEY set:", !!CLIENT_KEY);
console.log("[INIT] - SERVER_KEY length:", SERVER_KEY ? SERVER_KEY.length : 0);
console.log("[INIT] - CLIENT_KEY length:", CLIENT_KEY ? CLIENT_KEY.length : 0);

if (!SERVER_KEY || !CLIENT_KEY) {
    console.error("FATAL: Midtrans Key belum disetting di .env atau Netlify Dashboard!");
}

// Switching to CoreApi and Snap
let core = new midtransClient.CoreApi({
    isProduction: IS_PRODUCTION,
    serverKey: SERVER_KEY,
    clientKey: CLIENT_KEY
});

let snap = new midtransClient.Snap({
    isProduction: IS_PRODUCTION,
    serverKey: SERVER_KEY,
    clientKey: CLIENT_KEY
});

// --- LOAD DATABASE PRODUK ---
// --- LOAD DATABASE PRODUK (From Firebase) ---
// Will be loaded dynamically in handler

// --- INISIALISASI FIREBASE ---
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

// Database helper function
const getDb = () => {
    if (admin.apps.length) return admin.database();
    return null;
};

// --- HELPER: GENERATE KEY ---
const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return `PRIMA-${Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')).join('-')}`;
};

// --- HELPER: KIRIM EMAIL ---
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

exports.handler = async (event, context) => {
    // Header agar bisa diakses dari frontend (CORS)
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
    };

    const db = getDb();
    let PRICING_DB = {};

    if (db) {
        try {
            const prodSnap = await db.ref('products').once('value');
            if (prodSnap.exists()) PRICING_DB = prodSnap.val();
        } catch (e) {
            console.error("Failed to load products from Firebase:", e.message);
        }
    }

    // Fallback to local if Firebase failed or empty
    if (Object.keys(PRICING_DB).length === 0) {
        try {
            PRICING_DB = require('../../products.json');
            console.log("✅ Using fallback local products.json");
        } catch (e) {
            console.error("❌ Failed to load local products.json fallback:", e.message);
        }
    }

    if (event.httpMethod === 'GET') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                catalog: PRICING_DB,
                clientKey: CLIENT_KEY,
                isProduction: IS_PRODUCTION
            })
        };
    }

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: "Method Not Allowed" };


    try {
        const body = JSON.parse(event.body || '{}');
        const { action } = body;

        console.log(`[BACKEND] Received ${event.httpMethod} with action: ${action || 'None'}`);

        // --- PATH 1: REQ DARI STORE (Core API) ---
        if (action === 'create_transaction') {
            const { appId, duration, buyerName, buyerEmail, buyerPhone, paymentMethod, cardData } = body;
            const product = PRICING_DB[appId];
            if (!product || !product.price[duration]) return { statusCode: 400, headers, body: JSON.stringify({ error: "Produk invalid" }) };

            const price = Math.floor(product.price[duration]);
            const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            let parameter = {
                transaction_details: { order_id: orderId, gross_amount: price },
                customer_details: { first_name: buyerName, email: buyerEmail, phone: buyerPhone },
                item_details: [{ id: `${appId}-${duration}`, price: price, quantity: 1, name: `${product.name} (${duration})` }],
                custom_field1: appId, custom_field2: duration, custom_field3: 'public_store'
            };

            if (paymentMethod === 'qris') {
                parameter.payment_type = 'qris';
                parameter.qris = { acquirer: 'gopay' };
            } else if (['bca', 'mandiri', 'bni', 'bri', 'permata', 'cimb'].includes(paymentMethod)) {
                if (paymentMethod === 'mandiri') {
                    parameter.payment_type = 'echannel';
                    parameter.echannel = { bill_info1: "Payment:", bill_info2: "Software License" };
                } else {
                    parameter.payment_type = 'bank_transfer';
                    parameter.bank_transfer = { bank: paymentMethod };
                }
            } else if (paymentMethod === 'gopay' || paymentMethod === 'shopeepay') {
                parameter.payment_type = paymentMethod;
                parameter[paymentMethod] = { callback_url: "https://apps-primadev.netlify.app/thankyou" };
            } else if (paymentMethod === 'ovo' || paymentMethod === 'dana') {
                parameter.payment_type = 'qris';
                parameter.qris = { acquirer: 'gopay' };
            } else if (paymentMethod === 'indomaret' || paymentMethod === 'alfamart') {
                parameter.payment_type = 'cstore';
                parameter.cstore = {
                    store: paymentMethod,
                    message: "Pembayaran Lisensi PrimaDev"
                };
            } else if (paymentMethod === 'akulaku' || paymentMethod === 'kredivo') {
                parameter.payment_type = paymentMethod;
            } else if (paymentMethod === 'card') {
                if (!cardData) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: "Data kartu tidak ditemukan. Silakan coba lagi." }) };
                }

                // Using Snap for card payment (simpler & more reliable)
                try {
                    console.log("[BACKEND] Processing credit card payment via Snap API for order:", orderId);

                    if (!CLIENT_KEY) {
                        console.error("[BACKEND] CRITICAL: CLIENT_KEY is not set!");
                        throw new Error("CLIENT_KEY tidak dikonfigurasi. Hubungi administrator.");
                    }

                    // Prepare Snap parameter with card data
                    let snapParameter = {
                        transaction_details: { order_id: orderId, gross_amount: price },
                        customer_details: { first_name: buyerName, email: buyerEmail, phone: buyerPhone },
                        item_details: [{ id: `${appId}-${duration}`, price: price, quantity: 1, name: `${product.name} (${duration})` }],
                        custom_field1: appId, custom_field2: duration, custom_field3: 'public_store',
                        payment_type: 'credit_card',
                        credit_card: {
                            secure: true,
                            bank: 'bca', // Can be customized
                            installment: {
                                required: false
                            }
                        }
                    };

                    console.log("[BACKEND] Creating Snap transaction for card payment");

                    // Create Snap transaction which will return snap token + redirect URL
                    const snapTransaction = await snap.createTransaction(snapParameter);

                    console.log("[BACKEND] Snap transaction created successfully");
                    console.log("[BACKEND] Snap token:", snapTransaction.token);
                    console.log("[BACKEND] Redirect URL:", snapTransaction.redirect_url);

                    // Return snap response - frontend will redirect to Snap payment page
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            order_id: orderId,
                            snap_token: snapTransaction.token,
                            redirect_url: snapTransaction.redirect_url,
                            payment_type: 'snap_redirect'
                        })
                    };

                } catch (snapError) {
                    console.error("[BACKEND] Snap transaction failed:", snapError.message);
                    console.error("[BACKEND] Error details:", snapError);
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({
                            error: "Gagal membuat transaksi pembayaran: " + (snapError.message || "Silakan coba lagi.")
                        })
                    };
                }
            }

            console.log("[BACKEND] Charging with parameter:", JSON.stringify(parameter));

            try {
                const chargeResponse = await core.charge(parameter);
                console.log("[BACKEND] Charge Success:", JSON.stringify(chargeResponse));

                if (db) {
                    await db.ref(`transactions/${orderId}`).set({
                        orderId,
                        status: 'pending',
                        amount: price,
                        customerName: buyerName,
                        customerEmail: buyerEmail,
                        customerPhone: buyerPhone,
                        appName: product.name,
                        appId: appId,
                        duration,
                        orderType: 'NEW',
                        paymentMethod: paymentMethod,
                        createdAt: Date.now()
                    });
                }

                return { statusCode: 200, headers, body: JSON.stringify(chargeResponse) };
            } catch (chargeError) {
                console.error("[BACKEND] Charge Failed:", chargeError.message, chargeError.ApiResponse);
                return {
                    statusCode: chargeError.httpStatusCode || 400,
                    headers,
                    body: JSON.stringify({
                        error: chargeError.message,
                        details: chargeError.ApiResponse
                    })
                };
            }
        }

        if (action === 'verify_payment') {
            const { orderId } = body;
            if (!orderId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing orderId" }) };

            const statusResponse = await core.transaction.status(orderId);
            const transactionStatus = statusResponse.transaction_status;
            const fraudStatus = statusResponse.fraud_status;

            console.log(`[BACKEND] Verifying ${orderId}: ${transactionStatus} | Fraud: ${fraudStatus}`);

            if (transactionStatus !== 'capture' && transactionStatus !== 'settlement') {
                return { statusCode: 200, headers, body: JSON.stringify({ status: transactionStatus, isSuccess: false }) };
            }

            // Challenge di sandbox bisa diabaikan atau ditandai
            if (fraudStatus == 'challenge') {
                console.warn(`[BACKEND] Transaction ${orderId} is challenged.`);
            }

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

            console.log(`[BACKEND] OrderType: ${trxData.orderType} | TargetKey: ${trxData.targetLicenseKey || 'NewUser'}`);

            // --- PERPANJANGAN (RENEWAL) ---
            if (trxData.orderType === 'RENEWAL') {
                const targetKey = trxData.targetLicenseKey;
                if (!targetKey) {
                    console.error("[BACKEND ERROR] targetLicenseKey null untuk RENEWAL!");
                    return { statusCode: 400, headers, body: JSON.stringify({ error: "Target License Key missing in transaction" }) };
                }

                if (!db) return { statusCode: 500, headers, body: JSON.stringify({ error: "Database offline" }) };
                const licRef = db.ref(`licenses/${targetKey}`);
                const licSnap = await licRef.once('value');
                if (!licSnap.exists()) return { statusCode: 404, headers, body: JSON.stringify({ error: "License not found" }) };

                const currentData = licSnap.val();
                const now = new Date();
                let currentExpiry = currentData.expiryDate ? new Date(currentData.expiryDate) : null;
                if (currentExpiry && isNaN(currentExpiry.getTime())) currentExpiry = null;

                let baseDate = (currentExpiry && currentExpiry > now) ? currentExpiry : now;
                let newExpiry = new Date(baseDate);
                if (trxData.duration === 'yearly') newExpiry.setFullYear(newExpiry.getFullYear() + 1);
                else newExpiry.setMonth(newExpiry.getMonth() + 1);

                const expiryString = newExpiry.toISOString().split('T')[0];
                await licRef.update({ status: 'active', expiryDate: expiryString, lastRenewalDate: Date.now(), lastTransactionId: orderId });
                if (db) await db.ref(`transactions/${orderId}`).update({ status: 'success' });

                // Kirim Email Perpanjangan Berhasil
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
            const appId = body.appId || (trxData ? trxData.appId : 'struk-spbu');
            const duration = body.duration || (trxData ? trxData.duration : 'monthly');
            const product = PRICING_DB[appId] || { name: 'Aplikasi', price: {} };

            if (db) {
                const key = generateRandomKey();
                const expiry = new Date();
                if (duration === 'monthly') expiry.setMonth(expiry.getMonth() + 1);
                else if (duration === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1);
                else expiry.setFullYear(expiry.getFullYear() + 100);

                const newLicense = {
                    key, status: 'active', type: duration,
                    appName: product.name || (trxData ? trxData.appName : 'Aplikasi'),
                    appId: appId,
                    package: product.package || '',
                    price: product.price[duration] || (trxData ? trxData.amount : 0),
                    name: body.buyerName || (trxData ? trxData.customerName : 'Customer'),
                    email: body.buyerEmail || (trxData ? trxData.customerEmail : 'Email'),
                    expiryDate: expiry.toISOString().split('T')[0],
                    paymentMethod: `Midtrans ${statusResponse.payment_type}`, transactionId: orderId,
                    createdAt: Date.now()
                };
                await db.ref(`licenses/${key}`).set(newLicense);
                if (trxData) await db.ref(`transactions/${orderId}`).update({ status: 'success' });
                await sendEmail({ ...newLicense, key });
                return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', key }) };
            } else {
                return { statusCode: 500, headers, body: JSON.stringify({ error: "Database not connected" }) };
            }
        }

        // --- PATH 2: SNAP API (Tanpa Action) ---
        if (!action) {
            const { name = 'Customer', email = 'no-email@example.com', phone = '', amount = 0, duration = 'monthly', appName = 'Struk SPBU', licenseKey = null, orderType = 'NEW' } = body;
            if (amount <= 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid Amount' }) };

            const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const itemName = orderType === 'RENEWAL' ? `Perpanjang Lisensi (${duration})` : `Lisensi ${appName} (${duration})`;
            const itemId = orderType === 'RENEWAL' ? 'RENEWAL-SRV' : (duration + '-sub');

            const parameter = {
                transaction_details: { order_id: orderId, gross_amount: parseInt(amount) },
                customer_details: { first_name: name, email: email, phone: phone },
                item_details: [{ id: itemId, price: parseInt(amount), quantity: 1, name: itemName.substring(0, 50) }]
            };

            const transaction = await snap.createTransaction(parameter);
            if (db) {
                await db.ref(`transactions/${orderId}`).set({ orderId, status: 'pending', amount: parseInt(amount), customerName: name, customerEmail: email, customerPhone: phone, appName, duration, orderType, targetLicenseKey: licenseKey, createdAt: Date.now() });
            }

            return { statusCode: 200, headers, body: JSON.stringify({ token: transaction.token, redirect_url: transaction.redirect_url, orderId }) };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid action or request" }) };

    } catch (error) {
        console.error("Backend Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || "Internal error" }) };
    }
};
