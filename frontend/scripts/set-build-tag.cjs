const { execSync } = require('child_process');
const tag = `mode-panel-v1-${new Date().toISOString()}`;
console.log('[ForumKit] build tag:', tag);
process.env.VITE_BUILD_TAG = tag;
execSync('npx vite build', { stdio: 'inherit', env: process.env });
