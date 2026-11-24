import { copyFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
await Promise.all(['index.html', 'style.css', 'app.js', 'data.json'].map(name =>
  copyFile(new URL(name, root), new URL(name, output))
));
