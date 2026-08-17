const netlifyHandler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({})
        };
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            databaseURL: process.env.FIREBASE_DATABASE_URL,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            SUPABASE_URL: process.env.SUPABASE_URL || "",
            SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ""
        })
    };
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
