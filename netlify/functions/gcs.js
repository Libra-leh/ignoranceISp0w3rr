exports.handler = async (event) => {
  const GCS_KEY = process.env.GCS_KEY;
  const GCS_CX  = process.env.GCS_CX;

  if (!GCS_KEY || !GCS_CX) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GCS_KEY or GCS_CX env vars not set' }),
    };
  }

  const params = new URLSearchParams(event.queryStringParameters || {});
  params.set('key', GCS_KEY);
  params.set('cx',  GCS_CX);

  const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;

  try {
    const res  = await fetch(url);
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
