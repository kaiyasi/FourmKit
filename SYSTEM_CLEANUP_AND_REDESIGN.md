# ForumKit 系統清理與重新規劃報告（完整版）

**日期:** 2025-09-30
**版本:** V2.2.0 規劃
**狀態:** ✅ 已完成完整清理，待實作

---

## 一、完整清理摘要

### 已清除的系統模組

#### 1. Instagram 整合系統（已完全移除）
**後端清除：**
- `backend/models/instagram.py` - IG 資料模型（圖片模板、說明文字模板、發布記錄）
- `backend/migrations/versions/2025_09_30_add_instagram_tables.py` - IG 資料表遷移
- `backend/migrations/versions/2025_01_01_update_publish_modes.py` - 發布模式遷移
- `backend/services/content_generator_old.py` - 舊版內容生成器
- `backend/models/__init__.py` - 移除 IG 模型導入（IGImageTemplate, IGCaptionTemplate, InstagramPost）
- `backend/app.py` - 移除 Instagram 路由註冊

**前端清除：**
- 前端無 Instagram 專用組件（已在先前版本移除）

**歷史報告清除：**
- `IG_RENDERER_CLEANUP_REPORT.md`
- `IG_SYSTEM_CLEANUP_REPORT.md`
- `IG_SYSTEM_OPTIMIZATION_REPORT.md`
- `IG_TEMPLATE_SYSTEM_FIX_REPORT.md`
- `IG_TEMPLATE_SYSTEM_OPTIMIZATION_REPORT.md`

#### 2. Token 管理系統（歷史報告清除）
**清除報告：**
- `TOKEN_MANAGEMENT_OPTIMIZATION_REPORT.md`
- `TOKEN_MANAGEMENT_OPTIMIZATION_FINAL.md`
- `TOKEN_OPTIMIZATION_REPORT.md`

#### 3. 字體管理工具（已完全移除）
**後端清除：**
- `backend/routes/routes_fonts.py` - 字體管理 API（357 行）
- `backend/models/fonts.py` - 字體資料模型（FontFile, FontRequest）
- `backend/app.py` - 移除 fonts_bp 導入與註冊

**前端清除：**
- `frontend/src/components/admin/FontManagement.tsx` - 字體管理介面
- `frontend/src/components/admin/FontManagement.tsx.backup` - 備份文件
- `frontend/src/pages/admin/FontManagementPage.tsx` - 字體管理頁面
- `frontend/src/utils/font-safe-render.ts` - 字體渲染工具
- `frontend/src/main.tsx` - 移除 FontManagementPage 導入與路由（/admin/fonts）

**資料庫：**
- `font_files` 表 - 未創建（無相關 migration）
- `font_requests` 表 - 未創建（無相關 migration）

---

## 二、重新規劃：Instagram 整合系統

### 系統架構設計

#### 核心模組

```
backend/
├── models/
│   └── instagram.py                    # IG 資料模型
├── services/
│   ├── instagram/
│   │   ├── __init__.py
│   │   ├── ig_api_client.py           # Instagram Graph API 客戶端
│   │   ├── ig_token_manager.py        # Token 管理（刷新、驗證）
│   │   ├── ig_renderer.py             # 圖片與文字渲染
│   │   ├── ig_publisher.py            # 發布調度器
│   │   └── ig_scheduler.py            # 排程管理
│   └── tasks/
│       └── ig_tasks.py                 # Celery 背景任務
└── routes/
    └── routes_instagram.py             # IG API 路由

frontend/
└── src/
    ├── pages/admin/
    │   └── InstagramManagementPage.tsx # IG 管理介面
    └── components/instagram/
        ├── TemplateEditor.tsx          # 模板編輯器
        ├── PublishScheduler.tsx        # 發布排程
        └── TokenManager.tsx            # Token 管理
```

---

### 2.1 資料模型設計

#### InstagramAccount (IG 帳號管理)
```python
class InstagramAccount(Base):
    __tablename__ = "instagram_accounts"

    id: int
    school_id: int                      # 關聯學校
    ig_user_id: str                     # Instagram User ID
    username: str                       # IG 用戶名

    # Token 管理
    access_token: str                   # 加密存儲
    token_type: str                     # "USER" or "PAGE"
    expires_at: datetime                # Token 過期時間

    # 狀態
    is_active: bool
    last_token_refresh: datetime
    token_error: str | None

    # 配置
    auto_publish: bool                  # 是否自動發布
    publish_mode: PublishMode           # instant | batch | scheduled
    batch_count: int | None             # 批次發布數量
    default_schedule_time: str | None   # 預設排程時間 "18:00"
```

#### IGImageTemplate (圖片模板)
```python
class IGImageTemplate(Base):
    __tablename__ = "ig_image_templates"

    id: int
    template_id: str                    # 唯一識別碼
    school_id: int                      # 關聯學校
    name: str
    description: str | None

    # 模板配置
    mode: ImageTemplateMode             # with_attachment | text_only
    aspect_ratio: str                   # "1:1" | "4:5" | "9:16"
    canvas: dict                        # 畫布配置 JSON
    layers: list[dict]                  # 圖層配置 JSON

    # 狀態
    is_active: bool
    is_default: bool
    usage_count: int
```

#### IGCaptionTemplate (說明文字模板)
```python
class IGCaptionTemplate(Base):
    __tablename__ = "ig_caption_templates"

    id: int
    template_id: str
    school_id: int
    name: str
    description: str | None

    # 模板配置
    structure: list[dict]               # 文字結構 JSON
    hashtag_config: dict                # 標籤配置
    mentions: list[dict] | None         # 提及配置

    # 狀態
    is_active: bool
    is_default: bool
    usage_count: int
```

#### InstagramPost (IG 發布記錄)
```python
class InstagramPost(Base):
    __tablename__ = "instagram_posts"

    id: int
    public_id: str                      # IG-XXXX

    # 關聯
    forum_post_id: int                  # 論壇貼文
    ig_account_id: int                  # IG 帳號
    image_template_id: str
    caption_template_id: str

    # 渲染結果
    rendered_image_cdn_path: str | None
    rendered_caption: str | None
    preview_image_cdn_path: str | None

    # IG 發布資訊
    ig_media_id: str | None
    ig_permalink: str | None

    # 狀態
    status: InstagramPostStatus         # pending | rendering | ready | publishing | published | failed

    # 發布配置
    publish_mode: PublishMode           # instant | batch | scheduled
    scheduled_at: datetime | None
    published_at: datetime | None

    # 錯誤處理
    error_message: str | None
    retry_count: int
```

---

### 2.2 發布模式實現

#### 模式一：即時發布 (Instant)
```python
# 觸發條件：論壇貼文審核通過
# 狀態流轉：pending → rendering → ready → publishing → published

async def publish_instant(forum_post_id: int):
    """即時發布流程"""
    # 1. 創建 InstagramPost 記錄
    ig_post = InstagramPost(
        forum_post_id=forum_post_id,
        publish_mode=PublishMode.INSTANT,
        status=InstagramPostStatus.PENDING
    )

    # 2. 背景任務：渲染圖片與文字
    render_ig_post.delay(ig_post.id)

    # 3. 渲染完成後自動發布
    # 4. 失敗時自動重試（最多 3 次）
```

#### 模式二：批次發布 (Batch)
```python
# 觸發條件：累積達到設定數量（如 10 篇）
# 定時任務：每 5 分鐘檢查一次

@celery.task
def check_batch_publish():
    """檢查批次發布條件"""
    for account in InstagramAccount.query.filter_by(
        is_active=True,
        publish_mode=PublishMode.BATCH
    ):
        ready_count = InstagramPost.query.filter_by(
            ig_account_id=account.id,
            status=InstagramPostStatus.READY
        ).count()

        if ready_count >= account.batch_count:
            # 按 created_at 排序，取前 batch_count 篇發布
            batch_publish.delay(account.id, account.batch_count)
```

#### 模式三：排程發布 (Scheduled)
```python
# 觸發條件：scheduled_at 時間到達
# 定時任務：每分鐘檢查一次

@celery.task
def check_scheduled_publish():
    """檢查排程發布"""
    now = datetime.now(timezone.utc)
    posts = InstagramPost.query.filter(
        InstagramPost.status == InstagramPostStatus.READY,
        InstagramPost.publish_mode == PublishMode.SCHEDULED,
        InstagramPost.scheduled_at <= now
    ).all()

    for post in posts:
        publish_to_instagram.delay(post.id)
```

---

### 2.3 Token 管理系統

#### 核心功能
```python
class IGTokenManager:
    """Instagram Token 管理器"""

    async def refresh_token(account_id: int) -> bool:
        """刷新 Access Token（60天週期）"""
        account = InstagramAccount.query.get(account_id)

        # 使用 Graph API 刷新 Token
        response = requests.get(
            "https://graph.instagram.com/refresh_access_token",
            params={
                "grant_type": "ig_refresh_token",
                "access_token": account.access_token
            }
        )

        if response.ok:
            data = response.json()
            account.access_token = encrypt(data['access_token'])
            account.expires_at = datetime.now() + timedelta(seconds=data['expires_in'])
            account.last_token_refresh = datetime.now()
            return True
        return False

    async def validate_token(account_id: int) -> bool:
        """驗證 Token 有效性"""
        # 測試 API 呼叫
        pass

    @celery.task
    def auto_refresh_tokens():
        """自動刷新即將過期的 Token（每天執行）"""
        expiring_soon = InstagramAccount.query.filter(
            InstagramAccount.expires_at < datetime.now() + timedelta(days=7)
        ).all()

        for account in expiring_soon:
            refresh_token(account.id)
```

#### Token 加密存儲
```python
from cryptography.fernet import Fernet

ENCRYPTION_KEY = os.getenv("IG_TOKEN_ENCRYPTION_KEY")
cipher = Fernet(ENCRYPTION_KEY)

def encrypt_token(token: str) -> str:
    return cipher.encrypt(token.encode()).decode()

def decrypt_token(encrypted: str) -> str:
    return cipher.decrypt(encrypted.encode()).decode()
```

---

### 2.4 渲染引擎

#### 圖片渲染
```python
class IGRenderer:
    """IG 內容渲染器"""

    async def render_image(ig_post: InstagramPost) -> str:
        """渲染圖片並上傳至 CDN"""
        template = IGImageTemplate.query.filter_by(
            template_id=ig_post.image_template_id
        ).first()

        if template.mode == ImageTemplateMode.WITH_ATTACHMENT:
            # 使用論壇貼文圖片作為背景
            base_image = download_forum_post_image(ig_post.forum_post_id)
        else:
            # 純文字設計
            base_image = create_blank_canvas(template.canvas)

        # 應用圖層（文字、Logo、邊框等）
        for layer in template.layers:
            apply_layer(base_image, layer, ig_post.forum_post)

        # 上傳至 CDN
        cdn_path = upload_to_cdn(base_image, f"ig/{ig_post.public_id}.jpg")
        return cdn_path

    async def render_caption(ig_post: InstagramPost) -> str:
        """渲染說明文字"""
        template = IGCaptionTemplate.query.filter_by(
            caption_template_id=ig_post.caption_template_id
        ).first()

        caption_parts = []

        # 處理文字結構
        for block in template.structure:
            if block['type'] == 'forum_content':
                caption_parts.append(ig_post.forum_post.content)
            elif block['type'] == 'custom_text':
                caption_parts.append(block['text'])

        # 添加標籤
        hashtags = generate_hashtags(template.hashtag_config, ig_post.forum_post)
        caption_parts.append('\n' + ' '.join(hashtags))

        return '\n\n'.join(caption_parts)
```

---

### 2.5 發布 API

#### Instagram Graph API 發布流程
```python
class IGPublisher:
    """IG 發布器"""

    async def publish(ig_post: InstagramPost):
        """發布到 Instagram"""
        account = InstagramAccount.query.get(ig_post.ig_account_id)

        # Step 1: 創建 Media Container
        container_response = requests.post(
            f"https://graph.instagram.com/v18.0/{account.ig_user_id}/media",
            params={
                "image_url": get_public_cdn_url(ig_post.rendered_image_cdn_path),
                "caption": ig_post.rendered_caption,
                "access_token": decrypt_token(account.access_token)
            }
        )

        if not container_response.ok:
            raise PublishError(container_response.json())

        container_id = container_response.json()['id']

        # Step 2: 發布 Container
        publish_response = requests.post(
            f"https://graph.instagram.com/v18.0/{account.ig_user_id}/media_publish",
            params={
                "creation_id": container_id,
                "access_token": decrypt_token(account.access_token)
            }
        )

        if publish_response.ok:
            data = publish_response.json()
            ig_post.ig_media_id = data['id']
            ig_post.ig_permalink = get_permalink(account.username, data['id'])
            ig_post.status = InstagramPostStatus.PUBLISHED
            ig_post.published_at = datetime.now(timezone.utc)
        else:
            raise PublishError(publish_response.json())
```

---

## 三、重新規劃：字體管理系統

### 設計目標
- 支援 Google Fonts API 自動下載
- 支援自訂字體上傳（TTF/OTF）
- 中文字體支援檢測
- 字體預覽與樣式管理

### 資料模型

```python
class FontFile(Base):
    __tablename__ = "font_files"

    id: int
    font_family: str                    # 字體家族名稱
    display_name: str                   # 顯示名稱
    description: str | None

    # 檔案資訊
    filename: str                       # 實際檔案名稱
    file_path: str                      # 儲存路徑
    file_size: int                      # 檔案大小（bytes）
    file_format: str                    # ttf | otf | woff2

    # 字體屬性
    weight: str                         # 100-900 | normal | bold
    style: str                          # normal | italic
    is_chinese_supported: bool          # 是否支援中文

    # 來源
    source: str                         # google | upload | system
    google_font_id: str | None          # Google Font ID

    # 狀態
    is_active: bool
    is_system_font: bool                # 系統預設字體
    usage_count: int

    # 管理資訊
    uploaded_by: int | None
    created_at: datetime
```

### 核心功能

```python
class FontManager:
    """字體管理器"""

    async def download_google_font(font_family: str, weights: list[str]):
        """從 Google Fonts 下載字體"""
        # 使用 Google Fonts API
        pass

    async def upload_custom_font(file: UploadFile) -> FontFile:
        """上傳自訂字體"""
        # 驗證檔案格式
        # 解析字體元數據
        # 檢測中文支援
        pass

    async def test_chinese_support(font_path: str) -> bool:
        """檢測字體是否支援中文"""
        from PIL import ImageFont
        test_chars = "測試中文支援"
        # 嘗試渲染測試字元
        pass
```

---

## 四、實作優先順序

### Phase 1: 基礎架構（預計 2 天）
1. ✅ 清理舊系統
2. 建立新資料模型
3. 執行資料庫遷移

### Phase 2: Token 管理（預計 1 天）
1. OAuth 認證流程
2. Token 加密存儲
3. 自動刷新機制

### Phase 3: 渲染引擎（預計 2 天）
1. 圖片渲染核心
2. 文字渲染核心
3. 模板系統

### Phase 4: 發布系統（預計 2 天）
1. 即時發布
2. 批次發布
3. 排程發布

### Phase 5: 管理介面（預計 2 天）
1. IG 帳號管理
2. 模板編輯器
3. 發布排程介面

### Phase 6: 字體管理（預計 1 天）
1. Google Fonts 整合
2. 自訂字體上傳
3. 字體預覽

---

## 五、技術棧

### Backend
- **Flask** - Web 框架
- **SQLAlchemy** - ORM
- **Alembic** - 資料庫遷移
- **Celery** - 背景任務
- **Pillow** - 圖片處理
- **cryptography** - Token 加密

### Frontend
- **React** - UI 框架
- **TypeScript** - 類型安全
- **TailwindCSS** - 樣式
- **React Query** - 資料管理

### External APIs
- **Instagram Graph API v18.0**
- **Google Fonts API v1**

---

## 六、安全性考量

### Token 安全
- 使用 Fernet 加密存儲 Access Token
- Token 只在伺服器端處理，不傳送至前端
- 定期自動刷新 Token

### API 限流
- Instagram API Rate Limit: 200 calls/hour/user
- 實作請求佇列與延遲機制

### 權限控制
- 只有管理員可管理 IG 帳號
- 模板編輯需要管理員權限
- 發布操作記錄審計日誌

---

## 七、測試計劃

### 單元測試
- Token 管理功能
- 渲染引擎核心邏輯
- 發布排程演算法

### 整合測試
- OAuth 認證流程
- 完整發布流程（渲染 → 發布 → 狀態更新）
- Token 刷新機制

### 端對端測試
- 建立 IG 帳號
- 創建模板
- 發布貼文到測試帳號

---

## 八、文檔計劃

### 開發文檔
- API 設計文檔
- 資料模型文檔
- 系統架構圖

### 使用文檔
- IG 帳號設定指南
- 模板編輯教學
- 發布模式配置說明

---

**結論：** 新系統將更模組化、安全、易維護，並提供完整的 IG 發布功能。