#!/usr/bin/env node
// delete.js — remove a saved profile and its Raycast wrapper.
// Usage: node delete.js <profile-name>

const fs = require('fs');
const path = require('path');

function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('usage: delete.js <profile-name>');
    process.exit(1);
  }

  const targets = [
    path.join(__dirname, 'profiles', `${name}.json`),
    path.join(__dirname, 'profiles', `${name}.json.bak`),
    path.join(__dirname, 'raycast', `launch-${name}.sh`),
  ];

  let removed = 0;
  for (const p of targets) {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`  removed ${path.relative(__dirname, p)}`);
      removed++;
    }
  }

  if (removed === 0) {
    console.error(`nothing to delete — no profile or wrapper named "${name}"`);
    process.exit(1);
  }

  console.log(`> deleted ${removed} file(s) for "${name}"`);
}

main();
