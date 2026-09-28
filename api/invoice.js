const netlifyHandler = async (event) => {
  const id = event.queryStringParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: "Parameter ID invoice tidak ditemukan" })
    };
  }
  return {
    statusCode: 302,
    headers: {
      Location: `https://store.primadev.id/api/invoice?id=${encodeURIComponent(id)}`
    },
    body: ''
  };
};

module.exports = async (req, res) => {
  if (res && typeof res.status === 'function') {
    const id = req.query?.id || (req.url ? new URL(req.url, 'http://localhost').searchParams.get('id') : '');
    if (!id) {
      return res.status(400).json({ error: "Parameter ID invoice tidak ditemukan" });
    }
    res.setHeader('Location', `https://store.primadev.id/api/invoice?id=${encodeURIComponent(id)}`);
    return res.status(302).end();
  }

  return netlifyHandler(req);
};
