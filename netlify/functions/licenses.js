const fetch = require('node-fetch');
const admin = require('firebase-admin');
const { getPremiumTemplate } = require('./email_template');

// --- DATABASE PRODUK (Fallback agar harga tidak 0) ---
let PRICING_DB;
try {
  PRICING_DB = require('../../products.json');
} catch (e) {
  console.log("Using Default Pricing");
  PRICING_DB = {
    "struk-spbu": {
      "name": "Aplikasi Struk SPBU",
      "price": { "monthly": 80000, "yearly": 860000, "lifetime": 1599000 }
    }
  };
}

// --- INIT FIREBASE ---
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
        databaseURL: process.env.FIREBASE_DATABASE_URL || "https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app"
      });
    }
  } catch (error) {
    console.error("Firebase Init Error", error);
  }
}

const db = admin.database();

const sendEmail = async (data, contextMethod) => {
  if (contextMethod !== 'POST') return;

  const url = 'https://api.emailjs.com/api/v1.0/email/send';
  if (!process.env.EMAILJS_SERVICE_ID) return;

  // Fallback ke template premium jika html_template kosong
  const messageHtml = data.html_template || getPremiumTemplate({
    name: data.name,
    key: data.key,
    appName: data.appName || 'Aplikasi Struk SPBU',
    type: data.type || 'Standard',
    expiryDate: data.expiryDate,
    transactionId: data.transactionId || 'MANUAL-ADMIN'
  });

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
      type: data.type,
      message_html: messageHtml
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error("EmailJS Error:", await res.text());
    }
  } catch (err) {
    console.error("Email Error:", err);
  }
};

exports.handler = async (event, context) => {
  // Header agar bisa diakses dari frontend (CORS)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
  };

  // Helper Respon
  const respond = (statusCode, body) => {
    return {
      statusCode,
      headers,
      body: JSON.stringify(body)
    };
  };

  // Handle OPTIONS (Preflight Request)
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {});
  }

  const path = 'licenses';

  try {
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters.id;

      if (!id) return respond(400, { error: 'Missing ID parameter' });

      const snapshot = await db.ref(`${path}/${id}`).once('value');

      if (!snapshot.exists()) {
        return respond(404, { error: 'License Not Found' });
      }

      const data = snapshot.val();
      return respond(200, data);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { name, email, type, expiryDate, appName, sendEmailCheck, html_template, paymentMethod, transactionId, appId } = body;

      // Gunakan key dari body jika ada (dari Admin Panel), jika tidak generate baru
      const generateKey = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const seg = () => Array(4).fill(0).map(() => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
        return `PRIMA-${seg()}-${seg()}-${seg()}`;
      };

      const key = body.key || generateKey();

      const cleanType = (type || 'monthly').toLowerCase();
      let fixedPrice = 0;
      const product = PRICING_DB[appId] || PRICING_DB['struk-spbu'] || {};
      
      if (product.price && product.price[cleanType]) {
        fixedPrice = product.price[cleanType];
      }

      const autoTransactionId = transactionId || `MANUAL-${Date.now()}`;

      const newLicense = {
        key: key,
        status: 'active',
        type: cleanType,
        price: fixedPrice,
        deviceId: '',
        expiryDate,
        name,
        email,
        appId,
        appName: appName || product.name || 'Aplikasi Struk SPBU',
        package: body.package || '',
        paymentMethod: paymentMethod || 'Manual Admin',
        transactionId: autoTransactionId,
        createdAt: Date.now()
      };

      await db.ref(`${path}/${key}`).set(newLicense);

      if (sendEmailCheck) {
        await sendEmail({
          name,
          email,
          key,
          type,
          expiryDate,
          html_template,
          appName: appName || 'Aplikasi Struk SPBU',
          transactionId: autoTransactionId
        }, event.httpMethod);
      }

      return respond(201, { message: 'License Created', data: newLicense });
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body);
      const { id, status, expiryDate, deviceId } = body;

      if (!id) return respond(400, { error: 'No ID provided' });

      const safeStatus = status ? status.toLowerCase() : 'active';

      await db.ref(`${path}/${id}`).update({
        status: safeStatus,
        expiryDate,
        deviceId
      });

      return respond(200, { message: 'License Updated' });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters.id;
      if (!id) return respond(400, { error: 'No ID provided' });

      await db.ref(`${path}/${id}`).remove();
      return respond(200, { message: 'License Deleted' });
    }

    return respond(405, { error: 'Method Not Allowed' });

  } catch (error) {
    console.error("Backend Error:", error);
    return respond(500, { error: error.message });
  }
};