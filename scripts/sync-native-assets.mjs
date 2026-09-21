import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('build');
const targets = [
  path.resolve('native/android/app/src/main/assets/clarity'),
  path.resolve('native/apple/Resources/clarity'),
  path.resolve('native/windows/Clarity.Windows/www')
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(root, target, { recursive: true });
  console.log(`Synced build -> ${path.relative(process.cwd(), target)}`);
}
