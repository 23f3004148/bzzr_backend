const path = require('path');

// Always load backend/.env regardless of the current working directory
const envPath = path.join(__dirname, '..', '..', '.env');
require('dotenv').config({ path: envPath });

module.exports = process.env;
