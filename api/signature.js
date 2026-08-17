
const admin = require('firebase-admin');

if (!admin.apps.length) {
    let serviceAccount = null;
    try {
        if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY
                    .replace(/\\n/g, '\n')
                    .replace(/"/g, '')
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
        console.error('Firebase Init Error (signature.js):', err);
    }
}

const db = admin.database();

const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

const VALID_DOC_TYPES = ['spk_kontrak', 'spk_tetap', 'nda'];

const netlifyHandler = async (event) => {

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: HEADERS, body: '' };
    }

    try {
        if (event.httpMethod === 'GET') {
            const snap = await db.ref('settings').once('value');
            const settings = snap.val() || {};

            return {
                statusCode: 200,
                headers: HEADERS,
                body: JSON.stringify({
                    signature: settings.ceo_signature || null,
                    counters: settings.doc_counters || {
                        spk_kontrak: 0,
                        spk_tetap: 0,
                        nda: 0
                    }
                })
            };
        }

        if (event.httpMethod === 'POST') {

            const token = event.headers['x-admin-token'] ||
                event.headers['X-Admin-Token'];
            if (token !== process.env.ADMIN_SECRET) {
                return {
                    statusCode: 401,
                    headers: HEADERS,
                    body: JSON.stringify({ error: 'Unauthorized' })
                };
            }

            const body = JSON.parse(event.body || '{}');

            if (body.type === 'signature') {
                if (!body.data || !body.data.startsWith('data:image/')) {
                    return {
                        statusCode: 400,
                        headers: HEADERS,
                        body: JSON.stringify({ error: 'Invalid signature data' })
                    };
                }
                await db.ref('settings/ceo_signature').set(body.data);
                return {
                    statusCode: 200,
                    headers: HEADERS,
                    body: JSON.stringify({ success: true })
                };
            }

            if (body.type === 'counter') {
                const docType = body.docType;
                if (!VALID_DOC_TYPES.includes(docType)) {
                    return {
                        statusCode: 400,
                        headers: HEADERS,
                        body: JSON.stringify({ error: 'Invalid docType' })
                    };
                }

                const counterRef = db.ref(`settings/doc_counters/${docType}`);
                const snap = await counterRef.once('value');
                const next = (snap.val() || 0) + 1;
                await counterRef.set(next);

                return {
                    statusCode: 200,
                    headers: HEADERS,
                    body: JSON.stringify({ success: true, counter: next })
                };
            }

            return {
                statusCode: 400,
                headers: HEADERS,
                body: JSON.stringify({ error: 'Unknown type' })
            };
        }

        return {
            statusCode: 405,
            headers: HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' })
        };

    } catch (err) {
        console.error('signature.js error:', err);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: err.message })
        };
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
