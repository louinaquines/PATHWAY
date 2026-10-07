const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('dotenv');
const { cloudinaryConfig } = require('./cloudinaryUploads');

function loadLocalCloudinaryQa(env = process.env, read = () => fs.readFileSync(path.join(__dirname, '.env.cloudinary-qa'), 'utf8')) {
  if (env.PATHWAY_LOCAL_WORKFLOW !== '1') return false;
  // Do not silently inherit a production cloud into the demo workflow.
  for (const key of Object.keys(env)) if (key.startsWith('CLOUDINARY_')) delete env[key];
  let values;
  try { values = parse(read()); } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error('Could not read the local Cloudinary QA configuration.');
  }
  if (values.PATHWAY_CLOUDINARY_QA_CONFIRMED !== '1') return false;
  if (!cloudinaryConfig(values)) throw new Error('Complete the dedicated test Cloudinary credentials in .env.cloudinary-qa.');
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) env[key] = values[key];
  return true;
}

module.exports = { loadLocalCloudinaryQa };
