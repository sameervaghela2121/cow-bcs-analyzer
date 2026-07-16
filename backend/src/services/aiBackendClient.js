const axios = require('axios');
const FormData = require('form-data');
const config = require('../config/env');

async function assessImage({ buffer, mimeType, filename }) {
  const form = new FormData();
  form.append('images', buffer, { filename, contentType: mimeType });

  try {
    const response = await axios.post(`${config.aiBackendUrl}/api/bcs/assess`, form, {
      headers: form.getHeaders(),
      timeout: 60000,
    });
    return response.data;
  } catch (err) {
    const detail = err.response?.data?.detail || err.message;
    throw new Error(`ai-backend request failed: ${detail}`);
  }
}

module.exports = { assessImage };
