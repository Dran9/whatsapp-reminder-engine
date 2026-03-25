const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Envia un mensaje de texto via Meta Cloud API.
 * @param {string} to — numero destino con codigo de pais (ej: 5491155551234)
 * @param {string} body — texto del mensaje
 */
async function sendTextMessage(to, body) {
  const fetch = (await import('node-fetch')).default;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  console.log('Token primeros 20 chars:', token ? token.substring(0, 20) : 'UNDEFINED');

  const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${err}`);
  }

  return res.json();
}

module.exports = { sendTextMessage };
