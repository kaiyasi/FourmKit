// 根據作業系統自動執行權限指令
import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('執行後構建權限設定...');

if (os.platform() === 'win32') {
  // Windows: 檢查 dist 目錄是否存在並顯示提示
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    console.log('Windows 平台檢測到 dist 目錄已生成。');
    console.log('注意：在 Docker 環境中，您可能需要手動執行權限設定：');
    console.log('find dist -type d -exec chmod 755 {} \\; && find dist -type f -exec chmod 644 {} \\;');
    console.log('或者考慮使用 Docker 構建而不是 volume 掛載。');
  } else {
    console.log('警告：dist 目錄不存在，請先執行 npm run build');
  }
} else {
  // Linux/macOS: 執行原本的權限指令
  try {
    execSync('find dist -type d -exec chmod 755 {} \\; && find dist -type f -exec chmod 644 {} \\;', { stdio: 'inherit' });
    console.log('權限設定完成！');
  } catch (error) {
    console.error('權限設定失敗：', error.message);
  }
}
