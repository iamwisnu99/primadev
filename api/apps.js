const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const netlifyHandler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const method = event.httpMethod;
        const path = event.path.split('/').pop();
        const id = event.queryStringParameters ? event.queryStringParameters.id : null;

        if (method === 'GET') {
            if (id) {
                const { data, error } = await supabase
                    .from('apps')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (error) throw error;
                return { statusCode: 200, headers, body: JSON.stringify(data) };
            } else {
                const { data, error } = await supabase
                    .from('apps')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return { statusCode: 200, headers, body: JSON.stringify(data) };
            }
        }

        if (method === 'POST') {
            const body = JSON.parse(event.body);
            const { data, error } = await supabase
                .from('apps')
                .insert([body])
                .select();
            if (error) throw error;
            return { statusCode: 201, headers, body: JSON.stringify(data[0]) };
        }

        if (method === 'PUT') {
            const body = JSON.parse(event.body);
            if (!id) throw new Error('ID required for update');
            const { data, error } = await supabase
                .from('apps')
                .update(body)
                .eq('id', id)
                .select();
            if (error) throw error;
            return { statusCode: 200, headers, body: JSON.stringify(data[0]) };
        }

        if (method === 'DELETE') {
            if (!id) throw new Error('ID required for delete');
            const { error } = await supabase
                .from('apps')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return { statusCode: 200, headers, body: JSON.stringify({ message: 'Deleted' }) };
        }

        return { statusCode: 405, headers, body: 'Method Not Allowed' };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
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
