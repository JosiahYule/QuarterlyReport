import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = ['index.html', 'web/index.html', 'trends/index.html'];
let failed = false;

for (const f of files) {
  const src = readFileSync(resolve(process.cwd(), f), 'utf8');
  const hasBabel = /@babel\/standalone/.test(src) || /type="text\/babel"/.test(src);
  if (hasBabel) {
    console.warn(`[build-check] ${f}: still uses in-browser Babel transpilation.`);
    failed = true;
  } else {
    console.log(`[build-check] ${f}: ok (no in-browser Babel).`);
  }
}

if (failed) {
  console.error('\nBuild pipeline warning: migrate remaining pages away from in-browser Babel.');
  process.exit(1);
}
