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
                databaseURL: process.env.FIREBASE_DATABASE_URL || "https://strukmaker-3327d110-default-rtdb.asia-southeast1.firebasedatabase.app"
            });
        }
    } catch (error) {
        console.error("Firebase Init Error", error);
    }
}

const db = admin.database();

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
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Vary': 'Origin'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const respond = (statusCode, data) => {
        return {
            statusCode,
            headers,
            body: JSON.stringify(data)
        };
    };

    try {
        const path = 'settings/vacancies';

        if (event.httpMethod === 'GET') {
            const snapshot = await db.ref(path).once('value');
            const data = snapshot.val() || {};
            // Convert to array
            const dataArray = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            }));
            return respond(200, dataArray);
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { id, title, description, active } = body;

            if (!title || !description) {
                return respond(400, { error: 'Judul dan Deskripsi wajib diisi.' });
            }

            const vacancyId = id || `VAC-${Date.now()}`;
            const updatedVacancy = {
                title,
                description,
                active: active !== undefined ? active : true,
                updatedAt: Date.now()
            };

            await db.ref(`${path}/${vacancyId}`).set(updatedVacancy);
            return respond(200, { success: true, id: vacancyId, data: updatedVacancy });
        }

        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return respond(400, { error: 'ID lowongan tidak diberikan.' });
            }

            await db.ref(`${path}/${id}`).remove();
            return respond(200, { success: true, message: 'Lowongan berhasil dihapus.' });
        }

        return respond(405, { error: 'Metode tidak diizinkan.' });

    } catch (error) {
        console.error("Vacancy API Error:", error);
        return respond(500, { error: 'Terjadi kesalahan server.' });
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
