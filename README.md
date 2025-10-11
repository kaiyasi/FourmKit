# ForumKit - 校園匿名討論平台

> **由 Serelix Studio 開發的校園匿名論壇系統，具備完整內容審核功能** \n
> ** Version 4.0.0 開始平台內開始加入隱私資料與程式碼 故將不針對 V4.0.0 後發佈更新檔 **

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat\&logo=docker\&logoColor=white)](https://www.docker.com/)

---

## 🎯 專案特色

ForumKit 是一個專為校園環境設計的**半匿名/完全匿名發文平台**，支援 Web、Discord 串接與即時互動。

### ✨ 核心概念

* **🔒 匿名保護**: 支援完全匿名發文，保護用戶隱私
* **🏫 校園導向**: 專為校園社群設計，支援學校信箱驗證
* **🛡️ 內容安全**: 完整的內容審核系統，確保平台品質
* **🌐 多平台整合**: Web 平台 + Discord Bot 雙重體驗
* **⚡ 即時互動**: 支援即時聊天、通知和互動功能

### 🚀 技術架構

* **後端**: Flask + SQLite 多資料庫架構
* **前端**: React + TypeScript + Tailwind CSS
* **部署**: Docker + Docker Compose
* **即時通訊**: Socket.IO + WebSocket

---

## 🚀 快速開始

### 📋 前置要求

* Docker & Docker Compose

### 🛠️ 部署步驟

1. **複製專案並進入目錄**
   ```bash
   git clone https://github.com/kaiyasi/FourmKit.git
   cd ForumKit
   ```

2. **啟動所有服務**
   ```bash
   docker compose up -d --build
   ```

3. **初始化資料庫**
   ```bash
   docker compose exec backend alembic upgrade head
   ```

4. **建立管理帳號**
   ```bash
   docker compose exec backend python manage.py
   ```

---

## 📚 詳細文檔

* **功能說明**: 詳見 `documentation/features/`
* **架構文檔**: 詳見 `documentation/architecture/`
* **使用指南**: 詳見 `documentation/guides/`
* **版本記錄**: 詳見 `documentation/versions/VERSION_RECORD.md`

---

## 📄 授權條款

MIT License - 詳見 [LICENSE](LICENSE) 檔案

---

## 📞 支援與聯繫

* 🐛 **問題回報**: [GitHub Issues](https://github.com/kaiyasi/FourmKit/issues)
* 💬 **討論交流**: [GitHub Discussions](https://github.com/kaiyasi/FourmKit/discussions)
* 🛡️ **安全問題**: [網站支援系統](https://forum.serelix.xyz/support)
* 📢 **官方 Discord 群組**: [SerelixStudio_Discord](https://discord.gg/eRfGKepusP)
* 📸 **官方 IG**: [SerelixStudio_IG](https://www.instagram.com/serelix_studio?igsh=eGM1anl3em1xaHZ6&utm_source=qr)
* 📸 **匿名 IG**: [https://www.instagram.com/forumkit.serelix?igsh=MThtNDRzMGZqMnRhdw%3D%3D\&utm\_source=qr](https://www.instagram.com/forumkit.serelix?igsh=MThtNDRzMGZqMnRhdw%3D%3D&utm_source=qr)
* 📧 **官方 Gmail**: [serelixstudio@gmail.com](mailto:serelixstudio@gmail.com)

## 🔗 專案連結

* 🐙 **GitHub 專案**: [https://github.com/kaiyasi/FourmKit](https://github.com/kaiyasi/FourmKit)
* 🌐 **專案網站**: [https://forum.serelix.xyz](https://forum.serelix.xyz)

---

*ForumKit by Serelix Studio - 安全可靠的校園匿名討論平台* 🛡️


