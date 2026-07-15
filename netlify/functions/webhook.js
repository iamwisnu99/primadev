const admin = require('firebase-admin');
const midtransClient = require('midtrans-client');
const fetch = require('node-fetch');

// --- LOAD ENV ---
const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;
const { getPremiumTemplate, getRenewalTemplate } = require('./email_template');

// --- LOAD DB HARGA (Biar tau detail produk) ---
let PRICING_DB;
try { PRICING_DB = require('../../products.json'); } catch (e) { PRICING_DB = {}; }

// --- INIT MIDTRANS ---
let apiClient = new midtransClient.CoreApi({
  isProduction: IS_PRODUCTION,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY
});

// --- INIT FIREBASE ---
if (!admin.apps.length) {
  let serviceAccount = null;

  try {
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      console.log("[INIT] Menggunakan ENV Variable Terpisah...");
      serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
      };
    }
    // CARA 2: Cek Format JSON Satu Blok (Cara Lama)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("[INIT] Menggunakan ENV JSON Blob...");
      const raw = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      serviceAccount = {
        projectId: raw.project_id,
        clientEmail: raw.client_email,
        privateKey: raw.private_key.replace(/\\n/g, '\n') // Sanitasi juga
      };
    }
    // CARA 3: File Lokal (Hanya di Localhost)
    else if (!process.env.NETLIFY) {
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

  // --- FINAL CHECK & CONNECT ---
  const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app";

  if (serviceAccount && serviceAccount.privateKey) {
    const keySample = serviceAccount.privateKey.substring(0, 30);
    console.log(`[INIT] Private Key Check: ${keySample}... (Valid Header?)`);

    if (!serviceAccount.privateKey.includes("BEGIN PRIVATE KEY")) {
      console.error("❌ FATAL: Format Private Key SALAH! Pastikan mengandung '-----BEGIN PRIVATE KEY-----'");
    } else {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: dbUrl
      });
      console.log("✅ Firebase Berhasil Terhubung!");
    }
  } else {
    console.error("❌ FATAL: Tidak ada kredensial yang terbaca. Cek .env kamu!");
  }
}

const db = admin.database();

// --- HELPER: KEY GENERATOR ---
const generateRandomKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seg = () => Array(4).fill(0).map(() => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
  return `PRIMA-${seg()}-${seg()}-${seg()}`;
};

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
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) { }
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET' || !event.body) {
      return { statusCode: 200, body: 'Webhook endpoint active' };
    }

    const notification = JSON.parse(event.body);
    console.log("[WEBHOOK] Received notification:", JSON.stringify(notification));

    // --- DETEKSI SUMBER NOTIFIKASI (XENDIT VS MIDTRANS) ---
    const xCallbackToken = event.headers ? (event.headers['x-callback-token'] || event.headers['X-Callback-Token'] || event.headers['x-callback-Token']) : null;
    const isXendit = !!xCallbackToken || !!notification.external_id || !!notification.reference_id || (notification.data && !!notification.data.reference_id);

    let orderId = null;
    let transactionStatus = null;
    let fraudStatus = 'accept';
    let paymentType = 'Midtrans';

    if (isXendit) {
      console.log("[WEBHOOK] Detected Xendit notification payload");
      if (process.env.XENDIT_CALLBACK_TOKEN && xCallbackToken && xCallbackToken !== process.env.XENDIT_CALLBACK_TOKEN) {
        console.error("[WEBHOOK ERROR] Invalid Xendit callback token!");
        return { statusCode: 403, body: 'Forbidden - Invalid callback token' };
      }

      orderId = notification.external_id || notification.reference_id || (notification.data && notification.data.reference_id);
      const rawStatus = (notification.status || '').toUpperCase();

      if (rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' || rawStatus === 'PAID' || (!rawStatus && notification.bank_code && notification.account_number)) {
        transactionStatus = 'settlement';
      } else if (rawStatus === 'FAILED' || rawStatus === 'EXPIRED' || rawStatus === 'CANCELLED') {
        transactionStatus = 'cancel';
      } else {
        transactionStatus = 'pending';
      }

      if (notification.bank_code) paymentType = `Xendit VA (${notification.bank_code})`;
      else if (notification.channel_code) paymentType = `Xendit (${notification.channel_code})`;
      else if (notification.qr_string || notification.type === 'DYNAMIC') paymentType = `Xendit QRIS`;
      else if (notification.retail_outlet_name) paymentType = `Xendit Store (${notification.retail_outlet_name})`;
      else paymentType = `Xendit Payment`;

      console.log(`[WEBHOOK] Xendit Verified Order: ${orderId} | Status: ${transactionStatus} (${rawStatus})`);
    } else {
      let statusResponse;
      try {
        statusResponse = await apiClient.transaction.notification(notification);
      } catch (apiErr) {
        console.warn("[WEBHOOK] Midtrans API verification warning (Test Notification / Dummy ID):", apiErr.message);
        return { statusCode: 200, body: 'OK - Test notification received' };
      }

      orderId = statusResponse.order_id;
      transactionStatus = statusResponse.transaction_status;
      fraudStatus = statusResponse.fraud_status;
      paymentType = `Midtrans (${statusResponse.payment_type})`;

      console.log(`[WEBHOOK] Verified Midtrans Order: ${orderId} | Status: ${transactionStatus}`);
    }

    // Jika Sukses Bayar
    if (transactionStatus == 'capture' || transactionStatus == 'settlement') {
      if (transactionStatus == 'capture' && fraudStatus == 'challenge') {
        console.log("[WEBHOOK] Transaction is challenged, skipping.");
        return { statusCode: 200, body: 'Challenge ignored' };
      }

      // 1. AMBIL DATA TRANSAKSI DARI DB (Yang disimpan oleh public_order.js)
      const trxSnap = await db.ref(`transactions/${orderId}`).once('value');
      if (!trxSnap.exists()) {
        console.error(`[WEBHOOK ERROR] Transaksi ${orderId} tidak ditemukan di Firebase!`);
        return { statusCode: 200, body: 'Transaction not found in DB but acknowledged' };
      }

      const trxData = trxSnap.val();

      // Cek biar gak double process
      if (trxData.status === 'success') {
        console.log(`[WEBHOOK] Order ${orderId} already processed as success.`);
        return { statusCode: 200, body: 'Already processed' };
      }

      // Update Status Transaksi jadi Success
      await db.ref(`transactions/${orderId}`).update({
        status: 'success',
        payment_type: paymentType,
        paidAt: Date.now()
      });

      console.log(`[WEBHOOK] Processing orderType: ${trxData.orderType || 'NEW'}`);

      if (trxData.orderType === 'RENEWAL') {
        const targetKey = trxData.targetLicenseKey;
        console.log(`[WEBHOOK] Processing RENEWAL for Key: ${targetKey}`);

        if (!targetKey) {
          console.error("[WEBHOOK ERROR] targetLicenseKey is missing in transaction data!");
          return { statusCode: 200, body: 'Missing target key' };
        }

        const licRef = db.ref(`licenses/${targetKey}`);
        const licSnap = await licRef.once('value');

        if (licSnap.exists()) {
          const currentData = licSnap.val();
          const duration = trxData.duration || 'monthly';

          const now = new Date();
          let currentExpiry = currentData.expiryDate ? new Date(currentData.expiryDate) : null;

          // Safety Check: Jika format date di DB error/invalid
          if (currentExpiry && isNaN(currentExpiry.getTime())) {
            console.warn(`[WEBHOOK] Invalid expiryDate found for ${targetKey}: ${currentData.expiryDate}`);
            currentExpiry = null;
          }

          // Gunakan date yang lebih jauh (existing expiry atau hari ini)
          let baseDate = (currentExpiry && currentExpiry > now) ? currentExpiry : now;

          let newExpiry = new Date(baseDate);
          if (duration === 'yearly') {
            newExpiry.setFullYear(newExpiry.getFullYear() + 1);
          } else {
            newExpiry.setMonth(newExpiry.getMonth() + 1);
          }

          const expiryString = newExpiry.toISOString().split('T')[0];

          console.log(`[WEBHOOK] Extension: ${currentData.expiryDate} -> ${expiryString} (${duration})`);

          // Update Lisensi
          await licRef.update({
            status: 'active',
            expiryDate: expiryString,
            lastRenewalDate: Date.now(),
            lastTransactionId: orderId
          });

          // Kirim Email Perpanjangan Berhasil (WEBHOOK)
          await sendEmail({
            name: currentData.name,
            email: currentData.email,
            key: targetKey,
            appName: currentData.appName,
            expiryDate: expiryString,
            transactionId: orderId
          }, true);

          console.log(`[SUCCESS] License ${targetKey} extended successfully.`);
        } else {
          console.error(`[WEBHOOK ERROR] License ${targetKey} not found in database!`);
        }

      } else {
        // --- KASUS: PEMBELIAN BARU (Kode Lama) ---
        console.log("[WEBHOOK] Processing NEW LICENSE...");

        const newKey = generateRandomKey();
        const duration = trxData.duration;

        // Hitung Expiry Awal
        let expiry = new Date();
        if (duration === 'monthly') expiry.setMonth(expiry.getMonth() + 1);
        else if (duration === 'yearly') expiry.setFullYear(expiry.getFullYear() + 1);
        else expiry.setFullYear(expiry.getFullYear() + 100); // Lifetime

        const newLicenseData = {
          key: newKey,
          status: 'active',
          type: duration,
          appName: trxData.appName || 'Struk SPBU',
          name: trxData.customerName,
          email: trxData.customerEmail,
          price: trxData.amount,
          deviceId: '',
          expiryDate: expiry.toISOString().split('T')[0],
          paymentMethod: paymentType,
          transactionId: orderId,
          createdAt: Date.now()
        };

        // Simpan Lisensi Baru
        await db.ref(`licenses/${newKey}`).set(newLicenseData);

        // Kirim Email Lisensi Baru
        await sendEmail({
          email: newLicenseData.email,
          name: newLicenseData.name,
          key: newKey,
          appName: newLicenseData.appName,
          type: newLicenseData.type,
          expiryDate: newLicenseData.expiryDate,
          transactionId: orderId
        });
        console.log(`[SUCCESS] New License Created: ${newKey}`);
      }

      return { statusCode: 200, body: 'OK - Processed' };

    } else if (transactionStatus == 'cancel' || transactionStatus == 'deny' || transactionStatus == 'expire') {
      // Update Status Gagal
      await db.ref(`transactions/${orderId}`).update({ status: 'failed' });
      return { statusCode: 200, body: 'OK - Failed status recorded' };
    }

    return { statusCode: 200, body: 'OK - Pending or other status' };

  } catch (err) {
    console.error("Webhook Error:", err);
    return { statusCode: 500, body: err.message };
  }
};