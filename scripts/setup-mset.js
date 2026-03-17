#!/usr/bin/env node
/**
 * Prepare bundled mset runtime under resources/mset for Windows packaging.
 *
 * Copies mset.exe from windows-mset/ to resources/mset/ so electron-builder
 * can bundle it as an extraResource.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'windows-mset');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'resources', 'mset');
const MSET_EXE = 'mset.exe';

function main() {
  if (process.platform !== 'win32' && !process.env.LOBSTERAI_FORCE_MSET_SETUP) {
    console.log('[setup-mset] Skipping — not on Windows (set LOBSTERAI_FORCE_MSET_SETUP=1 to override)');
    return;
  }

  const sourceExe = path.join(SOURCE_DIR, MSET_EXE);
  if (!fs.existsSync(sourceExe)) {
    console.warn(`[setup-mset] Warning: ${sourceExe} not found, skipping`);
    return;
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[setup-mset] Created ${OUTPUT_DIR}`);
  }

  // Copy mset.exe
  const destExe = path.join(OUTPUT_DIR, MSET_EXE);
  fs.copyFileSync(sourceExe, destExe);
  console.log(`[setup-mset] Copied ${MSET_EXE} to ${OUTPUT_DIR}`);

  console.log('[setup-mset] Done');
}

main();
