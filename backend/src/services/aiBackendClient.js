const axios = require('axios');
const FormData = require('form-data');
const config = require('../config/env');

async function assessImage({ images }) {
  const form = new FormData();
  for (const image of images) {
    form.append('images', image.buffer, { filename: image.filename, contentType: image.mimeType });
  }

  try {
    const response = await axios.post(`${config.aiBackendUrl}/api/bcs/assess`, form, {
      headers: form.getHeaders(),
      timeout: 60000 + (images.length - 1) * 30000,
    });
    return response.data;
  } catch (err) {
    const detail = err.response?.data?.detail || err.message;
    throw new Error(`ai-backend request failed: ${detail}`);
  }
}

module.exports = { assessImage };
