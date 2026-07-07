require('dotenv').config();
const { ONEMAP_EMAIL, ONEMAP_PASSWORD } = process.env;
const { writeFile } = require('../utils');
const fs = require('fs');

if (!ONEMAP_EMAIL || !ONEMAP_PASSWORD) {
  console.error('Error: ONEMAP_EMAIL and ONEMAP_PASSWORD must be set in .env');
  process.exit(1);
}

async function fetchToken() {
  const response = await fetch(
    'https://www.onemap.gov.sg/api/auth/post/getToken',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ONEMAP_EMAIL,
        password: ONEMAP_PASSWORD,
      }),
    },
  );

  const data = await response.json();

  if (data.error) {
    console.error('Auth error:', data.error);
    process.exit(1);
  }

  const { access_token, expiry_timestamp } = data;

  if (!access_token) {
    console.error('No access_token in response:', data);
    process.exit(1);
  }

  // Update .env file with new token
  let envContent = fs.readFileSync('.env', 'utf-8');
  if (envContent.includes('ONEMAP_TOKEN=')) {
    envContent = envContent.replace(
      /ONEMAP_TOKEN=.*/,
      `ONEMAP_TOKEN=${access_token}`,
    );
  } else {
    envContent += `\nONEMAP_TOKEN=${access_token}`;
  }
  fs.writeFileSync('.env', envContent);

  const expiryDate = new Date(Number(expiry_timestamp) * 1000);
  console.log(`New token obtained`);
  console.log(`Expires: ${expiryDate.toISOString()}`);
  console.log(`Token: ${access_token.substring(0, 30)}...`);

  return access_token;
}

fetchToken();
