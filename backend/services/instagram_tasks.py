# backend/services/instagram_tasks.py
"""
Instagram 相關的 Celery 背景任務
處理圖片生成、發文排程、佇列管理等
"""
from celery import current_app
from celery.utils.log import get_task_logger
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import os
import traceback

from services.celery_app import celery_app
from services.instagram_api_service import InstagramAPIService, InstagramAPIError
try:
    from services.html_renderer import HtmlRenderer, HtmlRenderError
except Exception:
    HtmlRenderer = None  # type: ignore
    HtmlRenderError = Exception  # type: ignore
try:
    from services.html_builder import build_post_html
except Exception:
    build_post_html = None  # type: ignore

def _resolve_canvas_size(template_data: Optional[Dict]) -> tuple[int, int]:
    # 允許以環境變數強制尺寸（例如 1080x1080 或 1080）
    env_sz = os.getenv('IG_CANVAS_SIZE', '1080x1080').lower().strip()
    try:
        if 'x' in env_sz:
            w, h = env_sz.split('x', 1)
            return max(1, int(w)), max(1, int(h))
        val = int(env_sz)
        return val, val
    except Exception:
        pass

    # 後備：讀取模板配置
    try:
        can = (template_data or {}).get('canvas') or {}
        preset = str((can.get('preset') or '')).strip().lower()
        if preset == 'portrait':
            return 1080, 1350
        if preset == 'landscape':
            return 1080, 608
        if isinstance(can.get('width'), int) and isinstance(can.get('height'), int):
            return int(can['width']), int(can['height'])
        if preset == 'square':
            return 1080, 1080
    except Exception:
        pass
    # 預設採用 1080x1080，避免從 800 放大造成排版誤差
    return 1080, 1080
from services.media_service import MediaService
from utils.db import get_session
from models.instagram import IGAccount, IGTemplate, IGPost, PostStatus
from models.base import Post as ForumPost

logger = get_task_logger(__name__)

@celery_app.task(bind=True)
def publish_carousel_for_account(self, account_id: int, max_items: int = 5, caption_mode: str = 'first_title', custom_caption: str | None = None, dry_run: bool = False) -> Dict:
    """
    將指定帳號的多則待發貼文合併為一則輪播發布。

    - 會挑選狀態為 pending/queued 的 IGPost，最多 `max_items` 則（上限 10）。
    - 若貼文尚未有 generated_image，會就地生成（HTML→JPEG）。
    - `dry_run=True` 僅回報將使用哪些圖片與 caption，不實際發布。
    """
    max_items = max(1, min(int(max_items or 5), 10))
    try:
        with get_session() as db:
            account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
            if not account:
                return {"success": False, "error": "帳號不存在"}
            if account.status != 'active':
                return {"success": False, "error": f"帳號狀態異常: {account.status}"}

            # 依優先順序抓取就緒貼文
            posts = db.query(IGPost).filter(
                IGPost.account_id == account_id,
                IGPost.status.in_([PostStatus.pending, PostStatus.queued])
            ).order_by(
                IGPost.scheduled_at.asc().nulls_last(),
                IGPost.created_at.asc()
            ).limit(max_items).all()

            if not posts:
                return {"success": False, "error": "沒有待發貼文"}

            # 確保每則皆有圖片
            image_urls: list[str] = []
            used_post_ids: list[int] = []
            now_utc = datetime.now(timezone.utc)

            # 準備渲染器（可選）
            try:
                from services.html_renderer import HtmlRenderer, HtmlRenderError
                from services.html_builder import build_post_html
                html_renderer_available = True
            except Exception:
                html_renderer_available = False

            for igp in posts:
                # 若尚未生成圖片，走與單貼文相同的 HTML 渲染邏輯
                if not igp.generated_image:
                    if not html_renderer_available:
                        return {"success": False, "error": "Playwright/Html 渲染器未就緒，無法生成圖片"}

                    forum_post = db.query(ForumPost).filter(ForumPost.id == igp.forum_post_id).first()
                    template = db.query(IGTemplate).filter(IGTemplate.id == igp.template_id).first()
                    if not (forum_post and template):
                        continue

                    # 構建內容
                    post_content = {
                        'id': forum_post.id,
                        'title': getattr(forum_post, 'title', ''),
                        'content': forum_post.content,
                        'school_name': getattr(forum_post, 'school_name', ''),
                        'created_at': forum_post.created_at,
                    }
                    # 選擇 logo
                    effective_logo_path = None
                    try:
                        from models.instagram import SchoolLogo
                        school_logo = None
                        if account.school_id:
                            school_logo = db.query(SchoolLogo).filter(
                                SchoolLogo.school_id == account.school_id,
                                SchoolLogo.is_active == True,
                                SchoolLogo.logo_type == 'primary'
                            ).first()
                        tmpl_logo = (template.template_data or {}).get('logo', {})
                        effective_logo_path = tmpl_logo.get('image_url') or (school_logo.logo_url if school_logo else None)
                    except Exception:
                        pass

                    width, height = _resolve_canvas_size(template.template_data if template else None)
                    html_str = build_post_html(template.template_data or {}, post_content, effective_logo_path)
                    renderer = HtmlRenderer(viewport_width=width, viewport_height=height)
                    img_buf = renderer.render_html_to_image(html_str, width=width, height=height, image_type='jpeg', quality=95)

                    import os
                    root_dir = os.getenv('UPLOAD_ROOT', 'uploads')
                    out_dir = os.path.join(root_dir, 'public', 'instagram')
                    os.makedirs(out_dir, exist_ok=True)
                    fname = f"ig_post_{igp.id}_{int(datetime.now().timestamp())}.jpg"
                    fpath = os.path.join(out_dir, fname)
                    with open(fpath, 'wb') as f:
                        f.write(img_buf.getvalue())

                    cdn_base = (os.getenv('PUBLIC_CDN_URL') or '').rstrip('/')
                    base = (os.getenv('PUBLIC_BASE_URL') or '').rstrip('/')
                    if cdn_base:
                        img_url = f"{cdn_base}/instagram/{fname}"
                    elif base:
                        img_url = f"{base}/uploads/public/instagram/{fname}"
                    else:
                        img_url = f"/uploads/public/instagram/{fname}"

                    igp.generated_image = img_url
                    igp.status = PostStatus.queued
                    igp.updated_at = now_utc
                    db.commit()

                if igp.generated_image:
                    image_urls.append(igp.generated_image)
                    used_post_ids.append(igp.id)

            if not image_urls:
                return {"success": False, "error": "找不到可用圖片"}

            # 製作 caption
            def _safe(text: str) -> str:
                return (text or '').strip()

            caption = ""
            if caption_mode == 'custom' and custom_caption:
                caption = custom_caption
            elif caption_mode == 'join_titles':
                parts: list[str] = []
                for igp in posts:
                    fp = db.query(ForumPost).filter(ForumPost.id == igp.forum_post_id).first()
                    title = _safe(getattr(fp, 'title', '') if fp else '')
                    if not title and fp:
                        content = _safe(fp.content)
                        title = (content[:100] + '...') if len(content) > 100 else content
                    if title:
                        parts.append(title)
                caption = "\n".join(parts[:10])
            else:  # first_title (default)
                igp0 = posts[0]
                fp0 = db.query(ForumPost).filter(ForumPost.id == igp0.forum_post_id).first()
                title = _safe(getattr(fp0, 'title', '') if fp0 else '')
                if not title and fp0:
                    c0 = _safe(fp0.content)
                    title = (c0[:100] + '...') if len(c0) > 100 else c0
                caption = title

            # 模式：dry run 僅回傳計畫
            if dry_run:
                return {
                    "success": True,
                    "dry_run": True,
                    "selected_count": len(image_urls),
                    "post_ids": used_post_ids,
                    "caption": caption,
                    "image_urls": image_urls,
                }

            # 實際發布輪播
            api = InstagramAPIService()
            result = api.publish_carousel(account.ig_user_id, account.page_token, image_urls, caption)

            if result.get('success'):
                media_id = result.get('media_id')
                post_url = result.get('post_url')
                for igp in posts:
                    if igp.id in used_post_ids:
                        igp.status = PostStatus.published
                        igp.ig_media_id = media_id
                        igp.ig_post_url = post_url
                        igp.published_at = now_utc
                        igp.updated_at = now_utc
                # 帳號統計
                account.total_posts += 1  # 輪播視為一則貼文
                account.last_post_at = now_utc
                db.commit()

                return {
                    "success": True,
                    "account_id": account_id,
                    "media_id": media_id,
                    "post_url": post_url,
                    "selected_count": len(image_urls),
                    "post_ids": used_post_ids,
                    "caption": caption,
                }
            else:
                return {"success": False, "error": result.get('error', '發布失敗')}
    except Exception as e:
        logger.error(f"發布輪播失敗: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_post_for_instagram(self, ig_post_id: int) -> Dict:
    """
    處理單一 Instagram 貼文 (生成圖片 -> 排入佇列)
    
    Args:
        ig_post_id: IGPost ID
        
    Returns:
        Dict: 處理結果
    """
    logger.info(f"開始處理 Instagram 貼文 ID: {ig_post_id}")
    
    with get_session() as db:
        try:
            # 獲取貼文資料
            ig_post = db.query(IGPost).filter(IGPost.id == ig_post_id).first()
            if not ig_post:
                raise ValueError(f"找不到 IGPost ID: {ig_post_id}")
            
            # 更新狀態為處理中
            ig_post.status = PostStatus.processing
            db.commit()
            
            # 獲取相關資料
            forum_post = db.query(ForumPost).filter(ForumPost.id == ig_post.forum_post_id).first()
            template = db.query(IGTemplate).filter(IGTemplate.id == ig_post.template_id).first()
            account = db.query(IGAccount).filter(IGAccount.id == ig_post.account_id).first()
            
            if not all([forum_post, template, account]):
                raise ValueError("缺少必要的關聯資料")
            
            # 檢查帳號狀態
            if account.status != 'active':
                raise ValueError(f"Instagram 帳號狀態異常: {account.status}")
            
            # 一律改走 HTML 渲染
            prefer_html = True
            
            # 準備內容資料
            post_content = {
                'id': forum_post.id,
                'title': getattr(forum_post, 'title', ''),
                'content': forum_post.content,
                'school_name': getattr(forum_post, 'school_name', ''),
                'created_at': forum_post.created_at,
            }
            
            # 獲取學校 Logo (如果有)
            school_logo_path = None
            if account.school_id:
                from models.instagram import SchoolLogo
                school_logo = db.query(SchoolLogo).filter(
                    SchoolLogo.school_id == account.school_id,
                    SchoolLogo.is_active == True,
                    SchoolLogo.logo_type == 'primary'
                ).first()
                
                if school_logo:
                    school_logo_path = school_logo.logo_url
            
            # 選擇 Logo：優先用模板自帶的 logo.image_url，其次用學校 Logo
            effective_logo_path = None
            try:
                tmpl_logo = (template.template_data or {}).get('logo', {})
                effective_logo_path = tmpl_logo.get('image_url') or school_logo_path
            except Exception:
                effective_logo_path = school_logo_path

            if HtmlRenderer and build_post_html:
                # HTML → JPEG（直接由 Playwright 輸出）
                html = build_post_html(template.template_data or {}, post_content, effective_logo_path)
                # 設定畫布尺寸
                width, height = _resolve_canvas_size(template.template_data if template else None)
                renderer = HtmlRenderer(viewport_width=width, viewport_height=height)
                image_buffer = renderer.render_html_to_image(html, width=width, height=height, image_type='jpeg', quality=95)
            else:
                raise HtmlRenderError('HTML 渲染器未就緒，請確認 Playwright 安裝')
            
            # 上傳圖片到儲存（本地 or CDN）。實際發佈需可公開取用 URL。
            import os
            root_dir = os.getenv('UPLOAD_ROOT', 'uploads')
            # 與 docker-compose 的 cdn 服務對齊：公開目錄為 uploads/public
            upload_dir = os.path.join(root_dir, 'public', 'instagram')
            os.makedirs(upload_dir, exist_ok=True)
            
            image_filename = f"ig_post_{ig_post.id}_{int(datetime.now().timestamp())}.jpg"
            image_path = os.path.join(upload_dir, image_filename)
            
            with open(image_path, 'wb') as f:
                f.write(image_buffer.getvalue())
            
            # 生成 URL：
            # 1) 若設了 PUBLIC_CDN_URL（指向 cdn 服務，uploads/public 綁在 /），用它
            # 2) 否則用 PUBLIC_BASE_URL + /uploads/public/instagram/<file>
            cdn_base = os.getenv('PUBLIC_CDN_URL', '').rstrip('/')
            base = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
            if cdn_base:
                image_url = f"{cdn_base}/instagram/{image_filename}"
            elif base:
                image_url = f"{base}/uploads/public/instagram/{image_filename}"
            else:
                image_url = f"/uploads/public/instagram/{image_filename}"
            
            # 更新貼文記錄
            ig_post.generated_image = image_url
            ig_post.status = PostStatus.queued
            ig_post.updated_at = datetime.now(timezone.utc)
            db.commit()
            
            # 根據發布模式決定下一步
            if account.publish_mode == 'immediate':
                # 立即發布
                publish_to_instagram.delay(ig_post.id)
                
            elif account.publish_mode == 'scheduled' and ig_post.scheduled_at:
                # 檢查是否到時間發布
                if ig_post.scheduled_at <= datetime.now(timezone.utc):
                    publish_to_instagram.delay(ig_post.id)
                    
            elif account.publish_mode == 'batch':
                # 檢查批量佇列
                check_account_batch_queue.delay(account.id)
            
            logger.info(f"貼文處理完成 ID: {ig_post_id}, 圖片: {image_url}")
            
            return {
                "success": True,
                "ig_post_id": ig_post.id,
                "image_url": image_url,
                "status": ig_post.status
            }
            
        except Exception as e:
            logger.error(f"處理貼文 {ig_post_id} 失敗: {str(e)}")
            logger.error(traceback.format_exc())
            
            # 更新失敗狀態
            if 'ig_post' in locals():
                ig_post.status = PostStatus.failed
                ig_post.error_message = str(e)
                ig_post.retry_count = getattr(ig_post, 'retry_count', 0) + 1
                ig_post.updated_at = datetime.now(timezone.utc)
                db.commit()
            
            # 重試機制
            if self.request.retries < self.max_retries:
                retry_countdown = 60 * (2 ** self.request.retries)  # 指數退避
                logger.info(f"將在 {retry_countdown} 秒後重試...")
                raise self.retry(countdown=retry_countdown, exc=e)
            
            return {
                "success": False,
                "error": str(e),
                "ig_post_id": ig_post_id
            }

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_html_to_image(self, ig_post_id: int, html_content: str) -> Dict:
    """
    處理 HTML 內容 - 直接使用前端生成的圖片
    
    Args:
        ig_post_id: IGPost ID
        html_content: HTML 內容（目前不使用，直接回退到傳統方法）
        
    Returns:
        Dict: 處理結果
    """
    logger.info(f"開始處理 HTML 內容, 貼文 ID: {ig_post_id}")
    
    if not html_content or not isinstance(html_content, str):
        logger.info("未提供 html_content，回退到傳統圖片生成方法")
        return process_post_for_instagram(ig_post_id)

    with get_session() as db:
        try:
            ig_post = db.query(IGPost).filter(IGPost.id == ig_post_id).first()
            if not ig_post:
                raise ValueError(f"找不到 IGPost ID: {ig_post_id}")
            account = db.query(IGAccount).filter(IGAccount.id == ig_post.account_id).first()
            if not account:
                raise ValueError("找不到 IG 帳號")

            # 渲染 HTML → PNG（再轉 JPG）
            if HtmlRenderer is None:
                raise HtmlRenderError("HtmlRenderer 不可用（缺少 Playwright）")

            # 畫布尺寸：優先環境變數，否則模板，預設 800x800
            template = db.query(IGTemplate).filter(IGTemplate.id == ig_post.template_id).first()
            width, height = _resolve_canvas_size(template.template_data if template else None)

            renderer = HtmlRenderer(viewport_width=width, viewport_height=height)
            out = renderer.render_html_to_image(html_content, width=width, height=height, image_type='jpeg', quality=95)

            # 存檔到公開目錄
            import os, time
            root_dir = os.getenv('UPLOAD_ROOT', 'uploads')
            upload_dir = os.path.join(root_dir, 'public', 'instagram')
            os.makedirs(upload_dir, exist_ok=True)
            image_filename = f"ig_post_{ig_post.id}_{int(time.time())}.jpg"
            image_path = os.path.join(upload_dir, image_filename)
            with open(image_path, 'wb') as f:
                f.write(out.getvalue())

            cdn_base = (os.getenv('PUBLIC_CDN_URL') or '').rstrip('/')
            base = (os.getenv('PUBLIC_BASE_URL') or '').rstrip('/')
            if cdn_base:
                image_url = f"{cdn_base}/instagram/{image_filename}"
            elif base:
                image_url = f"{base}/uploads/public/instagram/{image_filename}"
            else:
                image_url = f"/uploads/public/instagram/{image_filename}"

            # 更新紀錄並排入發佈
            ig_post.generated_image = image_url
            ig_post.status = PostStatus.queued
            ig_post.updated_at = datetime.now(timezone.utc)
            db.commit()

            # 依帳號設定進入發佈
            if account.publish_mode == 'immediate' or (account.publish_mode == 'scheduled' and (ig_post.scheduled_at or datetime.now(timezone.utc)) <= datetime.now(timezone.utc)):
                publish_to_instagram.delay(ig_post.id)
            elif account.publish_mode == 'batch':
                check_account_batch_queue.delay(account.id)

            return {"success": True, "ig_post_id": ig_post.id, "image_url": image_url, "status": ig_post.status}

        except Exception as e:
            logger.error(f"HTML 轉圖片流程失敗: {e}")
            logger.error(traceback.format_exc())
            # 失敗回退：使用傳統圖片生成
            try:
                return process_post_for_instagram(ig_post_id)
            except Exception:
                return {"success": False, "error": str(e), "ig_post_id": ig_post_id}

@celery_app.task(bind=True, max_retries=3, default_retry_delay=120)
def publish_to_instagram(self, ig_post_id: int) -> Dict:
    """
    發布到 Instagram
    
    Args:
        ig_post_id: IGPost ID
        
    Returns:
        Dict: 發布結果
    """
    logger.info(f"開始發布到 Instagram, 貼文 ID: {ig_post_id}")
    
    with get_session() as db:
        try:
            # 獲取貼文資料
            ig_post = db.query(IGPost).filter(IGPost.id == ig_post_id).first()
            if not ig_post or ig_post.status != PostStatus.queued:
                raise ValueError(f"貼文不存在或狀態不正確: {ig_post_id}")
            
            account = db.query(IGAccount).filter(IGAccount.id == ig_post.account_id).first()
            forum_post = db.query(ForumPost).filter(ForumPost.id == ig_post.forum_post_id).first()
            
            if not all([account, forum_post]):
                raise ValueError("缺少必要的關聯資料")
            
            # 檢查圖片是否已生成
            if not ig_post.generated_image:
                raise ValueError("圖片尚未生成")
            
            # 準備文案
            caption = ig_post.custom_caption or forum_post.content
            
            # 添加預設標籤
            hashtags = ig_post.hashtags.copy() if ig_post.hashtags else []
            if account.auto_hashtags:
                hashtags.extend(account.auto_hashtags)
            
            # 移除重複標籤並格式化
            unique_hashtags = list(set(hashtags))
            if unique_hashtags:
                hashtag_text = ' '.join(f'#{tag.strip("#")}' for tag in unique_hashtags)
                caption = f"{caption}\n\n{hashtag_text}"
            
            # 限制文案長度
            if len(caption) > 2200:
                caption = caption[:2197] + "..."
            
            # 發布到 Instagram：允許僅提供 Page ID + Token（User 或 Page）。
            ig_api = InstagramAPIService()

            page_id = str(account.page_id or '').strip()
            page_token = str(account.page_token or '').strip()
            ig_user_id = str(account.ig_user_id or '').strip()

            def _is_ig_user_id(val: str) -> bool:
                try:
                    return bool(val) and val.isdigit() and val.startswith(('178', '179'))
                except Exception:
                    return False

            # 發佈前預檢：必須是可公開抓取且為 image/* 類型
            if ig_post.generated_image.startswith(('http://','https://')):
                try:
                    import requests as _rq
                    pre = _rq.head(ig_post.generated_image, timeout=6, allow_redirects=True)
                    ctype = pre.headers.get('Content-Type','')
                    if pre.status_code >= 400 or not ctype.startswith('image/'):
                        raise InstagramAPIError(f"圖片 URL 非 image/* 類型或不可達 (status={pre.status_code}, content_type={ctype})")
                except InstagramAPIError:
                    raise
                except Exception as _e:
                    raise InstagramAPIError(f"圖片 URL 預檢失敗：{_e}")
            else:
                raise InstagramAPIError("圖片 URL 不是完整網址，請設定 PUBLIC_BASE_URL 或 PUBLIC_CDN_URL")

            # 解析 IG_USER_ID 與 Page Token：優先修正 DB 內錯誤的 ig_user_id（被誤填成 Page ID 的情況）
            if page_id:
                if not _is_ig_user_id(ig_user_id):
                    # 1) 先用現有 token 嘗試解析（可能已是 Page Token 或具權限的 User Token）
                    try:
                        ig_user_id = ig_api.resolve_ig_user_id(page_id, page_token)
                    except InstagramAPIError:
                        # 2) 嘗試把目前 token 視為 User Token 兌換成 Page Token 再解析
                        try:
                            new_page_token = ig_api.get_page_token(page_token, page_id)
                            page_token = new_page_token
                            ig_user_id = ig_api.resolve_ig_user_id(page_id, page_token)
                        except InstagramAPIError as e2:
                            raise InstagramAPIError(f"解析 IG 帳號失敗：{e2.message}")

            # 不再回寫 ig_user_id（避免因歷史錯誤/權限變更造成持久化污染）
            # 仍允許回寫 page_token（可選）：若不希望寫入，移除下段
            try:
                if page_token and page_token != (account.page_token or ''):
                    account.page_token = page_token
                    account.updated_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                pass

            result = ig_api.publish_post(
                ig_user_id,
                page_token,
                ig_post.generated_image,
                caption
            )
            
            if result.get('success'):
                # 更新成功狀態
                ig_post.status = PostStatus.published
                ig_post.ig_media_id = result['media_id']
                ig_post.ig_post_url = result['post_url']
                ig_post.published_at = datetime.now(timezone.utc)
                ig_post.updated_at = datetime.now(timezone.utc)
                
                # 更新帳號統計
                account.total_posts += 1
                account.last_post_at = datetime.now(timezone.utc)
                
                # 更新模板使用次數
                template = db.query(IGTemplate).filter(IGTemplate.id == ig_post.template_id).first()
                if template:
                    template.usage_count += 1
                
                db.commit()
                
                logger.info(f"成功發布到 Instagram: {result['post_url']}")
                
                return {
                    "success": True,
                    "ig_post_id": ig_post.id,
                    "ig_media_id": result['media_id'],
                    "ig_post_url": result['post_url']
                }
            else:
                raise Exception(f"Instagram API 發布失敗: {result.get('error')}")
                
        except InstagramAPIError as e:
            logger.error(f"Instagram API 錯誤: {str(e)}")
            
            # 更新失敗狀態
            if 'ig_post' in locals():
                ig_post.status = PostStatus.failed
                ig_post.error_message = f"API錯誤: {str(e)}"
                ig_post.retry_count = getattr(ig_post, 'retry_count', 0) + 1
                ig_post.updated_at = datetime.now(timezone.utc)
                db.commit()
            
            # 如果是 Token 過期，更新帳號狀態
            if e.error_code in ['190', '463', '467']:  # Token 相關錯誤碼
                if 'account' in locals():
                    account.status = 'error'
                    db.commit()
                    logger.warning(f"帳號 {account.id} Token 已過期，已停用")
            
            return {
                "success": False,
                "error": str(e),
                "error_code": getattr(e, 'error_code', None),
                "ig_post_id": ig_post_id
            }
            
        except Exception as e:
            logger.error(f"發布貼文 {ig_post_id} 失敗: {str(e)}")
            logger.error(traceback.format_exc())
            
            # 更新失敗狀態
            if 'ig_post' in locals():
                ig_post.status = PostStatus.failed
                ig_post.error_message = str(e)
                ig_post.retry_count = getattr(ig_post, 'retry_count', 0) + 1
                ig_post.updated_at = datetime.now(timezone.utc)
                db.commit()
            
            # 重試機制 (但不重試 API 相關錯誤)
            if self.request.retries < self.max_retries and not isinstance(e, InstagramAPIError):
                retry_countdown = 120 * (2 ** self.request.retries)
                logger.info(f"將在 {retry_countdown} 秒後重試...")
                raise self.retry(countdown=retry_countdown, exc=e)
            
            return {
                "success": False,
                "error": str(e),
                "ig_post_id": ig_post_id
            }

@celery_app.task
def process_scheduled_posts() -> Dict:
    """處理定時發布貼文"""
    logger.info("檢查定時發布貼文...")
    
    with get_session() as db:
        now = datetime.now(timezone.utc)
        
        # 查詢到期的定時貼文
        scheduled_posts = db.query(IGPost).filter(
            IGPost.status == PostStatus.queued,
            IGPost.scheduled_at <= now
        ).all()
        
        processed_count = 0
        for post in scheduled_posts:
            try:
                publish_to_instagram.delay(post.id)
                processed_count += 1
                logger.info(f"已觸發定時貼文發布: {post.id}")
            except Exception as e:
                logger.error(f"觸發定時貼文 {post.id} 發布失敗: {str(e)}")
        
        logger.info(f"已處理 {processed_count} 個定時貼文")
        
        return {
            "processed_count": processed_count,
            "total_found": len(scheduled_posts)
        }

@celery_app.task
def check_batch_queues() -> Dict:
    """檢查批量發布佇列"""
    logger.info("檢查批量發布佇列...")
    
    with get_session() as db:
        # 查詢啟用批量模式的帳號
        batch_accounts = db.query(IGAccount).filter(
            IGAccount.publish_mode == 'batch',
            IGAccount.status == 'active'
        ).all()
        
        processed_accounts = 0
        total_published = 0
        
        for account in batch_accounts:
            try:
                result = _process_account_batch_queue(db, account)
                if result['published_count'] > 0:
                    processed_accounts += 1
                    total_published += result['published_count']
                    logger.info(f"帳號 {account.id} 批量發布了 {result['published_count']} 個貼文")
            except Exception as e:
                logger.error(f"處理帳號 {account.id} 批量佇列失敗: {str(e)}")
        
        logger.info(f"批量發布檢查完成: {processed_accounts} 個帳號, 共發布 {total_published} 個貼文")
        
        return {
            "processed_accounts": processed_accounts,
            "total_published": total_published,
            "checked_accounts": len(batch_accounts)
        }

@celery_app.task
def check_account_batch_queue(account_id: int) -> Dict:
    """檢查特定帳號的批量發布佇列"""
    logger.info(f"檢查帳號 {account_id} 的批量佇列...")
    
    with get_session() as db:
        account = db.query(IGAccount).filter(IGAccount.id == account_id).first()
        if not account or account.publish_mode != 'batch':
            return {"success": False, "error": "帳號不存在或非批量模式"}
        
        try:
            result = _process_account_batch_queue(db, account)
            return {
                "success": True,
                "account_id": account_id,
                **result
            }
        except Exception as e:
            logger.error(f"處理帳號 {account_id} 批量佇列失敗: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "account_id": account_id
            }

def _process_account_batch_queue(db, account: IGAccount) -> Dict:
    """處理單一帳號的批量佇列 - 使用新的批量發布系統"""
    try:
        from services.ig_batch_publisher import get_batch_publisher
        
        # 使用新的批量發布器
        batch_publisher = get_batch_publisher()
        result = batch_publisher.batch_publish_account(account.id)
        
        logger.info(f"帳號 {account.id} 批量發布完成: {result.summary}")
        
        return {
            "published_count": result.success_count,
            "error_count": result.error_count,
            "total_processed": len(result.results),
            "batch_size": result.batch_size,
            "success_rate": result.success_count / max(len(result.results), 1) * 100,
            "details": result.to_dict()
        }
        
    except Exception as e:
        logger.error(f"新批量發布系統處理失敗，回退到舊邏輯: {str(e)}")
        
        # 回退到舊的邏輯（作為備用）
        queued_count = db.query(IGPost).filter(
            IGPost.account_id == account.id,
            IGPost.status.in_([PostStatus.pending, PostStatus.queued])
        ).count()
        
        if queued_count > 0:
            # 只處理一個批次的大小
            batch_size = min(queued_count, account.batch_threshold)
            queued_posts = db.query(IGPost).filter(
                IGPost.account_id == account.id,
                IGPost.status.in_([PostStatus.pending, PostStatus.queued])
            ).order_by(IGPost.created_at).limit(batch_size).all()
            
            published_count = 0
            for post in queued_posts:
                try:
                    publish_to_instagram.delay(post.id)
                    published_count += 1
                except Exception as pub_e:
                    logger.error(f"提交發布任務失敗 [post_id={post.id}]: {str(pub_e)}")
            
            return {
                "published_count": published_count,
                "error_count": batch_size - published_count,
                "total_processed": batch_size,
                "batch_size": account.batch_threshold,
                "fallback_mode": True
            }
        else:
            return {
                "published_count": 0,
                "error_count": 0,
                "total_processed": 0,
                "queued_count": queued_count,
                "batch_size": account.batch_threshold
            }


@celery_app.task
def sync_approved_posts() -> Dict:
    """掃描最近核准的論壇貼文，為符合條件的 IG 帳號自動建立發文任務。
    條件：
    - IGAccount.status == active
    - 若 account.school_id 設定 → 只同步該校貼文；否則允許跨校（school_id is None）
    - 該 account 的預設模板存在
    - 尚未為 (forum_post_id, account_id) 建立 IGPost
    """
    logger.info("開始同步核准貼文至 IG 發文佇列…")
    created_count = 0
    skipped_count = 0
    with get_session() as db:
        try:
            # 查詢可用帳號
            accounts = db.query(IGAccount).filter(IGAccount.status == 'active').all()
            now = datetime.now(timezone.utc)
            # 抓取策略：以「最近核准狀態」為主，不再強依 created_at
            # 仍保留可選的時間窗作為額外限制
            try:
                import os
                days = os.getenv('IG_SYNC_APPROVED_DAYS')
                days = int(days) if (days and str(days).isdigit()) else None
            except Exception:
                days = None

            for acc in accounts:
                # 預設模板
                tmpl = db.query(IGTemplate).filter(
                    IGTemplate.account_id == acc.id,
                    IGTemplate.is_default == True,
                    IGTemplate.is_active == True,
                ).first()
                if not tmpl:
                    skipped_count += 1
                    continue

                # 基礎條件：approved 貼文（不以 created_at 強限，避免「老文剛核准」被忽略）
                q = db.query(ForumPost).filter(
                    ForumPost.status == 'approved',
                    ForumPost.is_deleted == False,  # type: ignore[attr-defined]
                )
                # 若設定了時間窗，則加上 created_at 篩選以減少掃描
                if days and days > 0:
                    try:
                        cutoff = now - timedelta(days=min(days, 30))
                        q = q.filter(ForumPost.created_at >= cutoff)
                    except Exception:
                        pass
                # 帳號綁定學校 → 只同步該校
                if acc.school_id is not None:
                    q = q.filter(ForumPost.school_id == acc.school_id)
                else:
                    # 全域帳號：同步所有學校的核准貼文（不再僅限 school_id is None）
                    pass

                # 以 id 由新到舊排序，限制最多 200 筆，避免全表掃
                posts = q.order_by(ForumPost.id.desc()).limit(200).all()
                for fp in posts:
                    # 是否已有發文任務
                    exists = db.query(IGPost).filter(
                        IGPost.forum_post_id == fp.id,
                        IGPost.account_id == acc.id,
                    ).first()
                    if exists:
                        continue

                    ig_post = IGPost(
                        account_id=acc.id,
                        forum_post_id=fp.id,
                        template_id=tmpl.id,
                        status=PostStatus.pending,
                        scheduled_at=(now if acc.publish_mode == 'scheduled' else None),
                    )
                    db.add(ig_post)
                    db.commit()
                    db.refresh(ig_post)
                    created_count += 1

                    # 觸發處理流程
                    try:
                        process_post_for_instagram.delay(ig_post.id)
                    except Exception:
                        pass

            logger.info(f"同步完成：新增 {created_count} 筆，略過 {skipped_count} 個帳號（無預設模板或不符條件）")
            return {"success": True, "created": created_count, "skipped_accounts": skipped_count}
        except Exception as e:
            logger.error(f"同步核准貼文失敗: {e}")
            logger.error(traceback.format_exc())
            return {"success": False, "error": str(e)}
