'use strict';

const { CONFIG } = require('../config');

let sharpLib;

async function loadSharp() {
  if (sharpLib) return sharpLib;
  try {
    sharpLib = require('sharp');
  } catch (e) {
    console.log('  sharpをインストール中...');
    await new Promise(function(resolve, reject) {
      require('child_process').exec('npm install sharp', function(err) { err ? reject(err) : resolve(); });
    });
    sharpLib = require('sharp');
  }
  return sharpLib;
}

async function cleanseImage(imageBuffer) {
  const s = await loadSharp();
  return s(imageBuffer)
    .resize(CONFIG.image.maxWidth, null, { withoutEnlargement: true, fit: 'inside' })
    .modulate({ brightness: CONFIG.image.brightness, saturation: 1.05 })
    .linear(CONFIG.image.contrast, -(128 * CONFIG.image.contrast - 128))
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: CONFIG.image.quality, mozjpeg: true })
    .toBuffer();
}

module.exports = { cleanseImage };
