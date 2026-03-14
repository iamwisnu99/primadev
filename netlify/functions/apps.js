const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
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
