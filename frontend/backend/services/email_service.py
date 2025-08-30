"""
Email 服務 - 支援工單系統的信件發送
包含模板渲染、簽章連結生成、佇列處理等功能
"""
from __future__ import annotations
import os
import smtplib
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart
from datetime import datetime, timezone
from typing import Dict, Optional, Any, List
from dataclasses import dataclass
from urllib.parse import urljoin

from flask import current_app, render_template_string
from services.support_service import SupportService


@dataclass
class EmailTemplate:
    """Email 模板資料類"""
    subject: str
    html_body: str
    text_body: str
    

class EmailTemplates:
    """Email 模板庫"""
    
    TICKET_CREATED_GUEST = EmailTemplate(
        subject="[工單 #{{ticket_id}}] 您的支援工單已建立",
        html_body="""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #333; margin: 0;">支援工單已建立</h1>
                <p style="color: #666; margin: 10px 0 0 0;">工單編號：#{{ticket_id}}</p>
            </div>
            
            <div style="background: white; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="color: #333; margin-top: 0;">工單詳情</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>主題：</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">{{subject}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>分類：</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">{{category}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;"><strong>優先級：</strong></td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">{{priority}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0;"><strong>建立時間：</strong></td>
                        <td style="padding: 8px 0;">{{created_at}}</td>
                    </tr>
                </table>
                
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 4px;">
                    <strong>初始內容：</strong>
                    <div style="margin-top: 10px; white-space: pre-wrap;">{{body}}</div>
                </div>
            </div>
            
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="color: #1976d2; margin-top: 0;">追蹤您的工單</h3>
                <p style="margin-bottom: 15px;">點擊下方連結查看工單狀態並回覆：</p>
                <a href="{{tracking_url}}" style="display: inline-block; background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">查看工單</a>
                <p style="margin-top: 15px; font-size: 12px; color: #666;">
                    連結有效期：30 天<br>
                    如果按鈕無法點擊，請複製以下網址到瀏覽器：<br>
                    <code style="background: #f0f0f0; padding: 2px 4px;">{{tracking_url}}</code>
                </p>
            </div>
            
            <div style="border-top: 1px solid #e9ecef; padding-top: 20px; color: #666; font-size: 12px;">
                <p>此為系統自動發送的郵件，請勿直接回覆。如需協助，請透過工單系統回覆。</p>
                <p>© {{year}} ForumKit 支援團隊</p>
            </div>
        </div>
        """,
        text_body="""
支援工單已建立

工單編號：#{{ticket_id}}
主題：{{subject}}
分類：{{category}}
優先級：{{priority}}
建立時間：{{created_at}}

初始內容：
{{body}}

追蹤連結：{{tracking_url}}

請保存此郵件以便後續追蹤。如需協助，請透過上述連結回覆。

© {{year}} ForumKit 支援團隊
        """
    )
    
    ADMIN_REPLIED = EmailTemplate(
        subject="[工單 #{{ticket_id}}] 管理員已回覆",
        html_body="""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2e7d32; margin: 0;">管理員已回覆您的工單</h1>
                <p style="color: #666; margin: 10px 0 0 0;">工單編號：#{{ticket_id}}</p>
            </div>
            
            <div style="background: white; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="color: #333; margin-top: 0;">{{subject}}</h2>
                
                <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-left: 4px solid #2e7d32;">
                    <strong>管理員回覆：</strong>
                    <div style="margin-top: 10px; white-space: pre-wrap;">{{reply_body}}</div>
                    <div style="margin-top: 10px; font-size: 12px; color: #666;">
                        回覆時間：{{reply_time}}
                    </div>
                </div>
                
                <div style="margin-top: 20px;">
                    <strong>工單狀態：</strong> 
                    <span style="background: #e8f5e8; color: #2e7d32; padding: 4px 8px; border-radius: 4px; font-size: 12px;">{{status}}</span>
                </div>
            </div>
            
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="color: #1976d2; margin-top: 0;">回覆或查看完整對話</h3>
                <a href="{{tracking_url}}" style="display: inline-block; background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">前往工單頁面</a>
            </div>
            
            <div style="border-top: 1px solid #e9ecef; padding-top: 20px; color: #666; font-size: 12px;">
                <p>此為系統自動發送的郵件，請勿直接回覆。如需回覆，請透過上方連結進入工單系統。</p>
                <p>© {{year}} ForumKit 支援團隊</p>
            </div>
        </div>
        """,
        text_body="""
管理員已回覆您的工單

工單編號：#{{ticket_id}}
主題：{{subject}}
工單狀態：{{status}}

管理員回覆：
{{reply_body}}

回覆時間：{{reply_time}}

查看完整對話或回覆：{{tracking_url}}

© {{year}} ForumKit 支援團隊
        """
    )
    
    TICKET_RESOLVED = EmailTemplate(
        subject="[工單 #{{ticket_id}}] 工單已解決",
        html_body="""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2e7d32; margin: 0;">工單已解決</h1>
                <p style="color: #666; margin: 10px 0 0 0;">工單編號：#{{ticket_id}}</p>
            </div>
            
            <div style="background: white; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="color: #333; margin-top: 0;">{{subject}}</h2>
                <p>您的支援工單已被標記為「已解決」。如果問題確實已解決，此工單將在 3 天後自動關閉。</p>
                
                {% if resolution_note %}
                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #2e7d32;">
                    <strong>解決說明：</strong>
                    <div style="margin-top: 10px; white-space: pre-wrap;">{{resolution_note}}</div>
                </div>
                {% endif %}
            </div>
            
            <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="color: #ef6c00; margin-top: 0;">問題還沒解決？</h3>
                <p>如果您的問題尚未完全解決，請透過下方連結回覆工單：</p>
                <a href="{{tracking_url}}" style="display: inline-block; background: #ef6c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">回覆工單</a>
            </div>
            
            <div style="border-top: 1px solid #e9ecef; padding-top: 20px; color: #666; font-size: 12px;">
                <p>感謝您使用 ForumKit 支援服務！如果滿意我們的服務，歡迎給我們回饋。</p>
                <p>© {{year}} ForumKit 支援團隊</p>
            </div>
        </div>
        """,
        text_body="""
工單已解決

工單編號：#{{ticket_id}}
主題：{{subject}}

您的支援工單已被標記為「已解決」。如果問題確實已解決，此工單將在 3 天後自動關閉。

{% if resolution_note %}
解決說明：
{{resolution_note}}
{% endif %}

如果問題尚未完全解決，請透過以下連結回覆：
{{tracking_url}}

© {{year}} ForumKit 支援團隊
        """
    )


class EmailService:
    """Email 發送服務類"""
    
    def __init__(self, app=None):
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """初始化 Flask 應用"""
        self.app = app
        
        # 設定預設配置
        app.config.setdefault('MAIL_SERVER', 'localhost')
        app.config.setdefault('MAIL_PORT', 587)
        app.config.setdefault('MAIL_USE_TLS', True)
        app.config.setdefault('MAIL_USE_SSL', False)
        app.config.setdefault('MAIL_USERNAME', '')
        app.config.setdefault('MAIL_PASSWORD', '')
        app.config.setdefault('MAIL_DEFAULT_SENDER', 'noreply@forumkit.local')
        app.config.setdefault('SUPPORT_BASE_URL', 'http://localhost:12005')
    
    def _render_template(self, template: EmailTemplate, variables: Dict[str, Any]) -> tuple[str, str]:
        """渲染郵件模板"""
        try:
            # 添加年份變數
            variables['year'] = datetime.now().year
            
            # 渲染 HTML 和 Text 內容
            html_content = render_template_string(template.html_body, **variables)
            text_content = render_template_string(template.text_body, **variables)
            subject = render_template_string(template.subject, **variables)
            
            return subject, html_content, text_content
            
        except Exception as e:
            current_app.logger.error(f"Template rendering failed: {e}")
            raise
    
    def _send_email(self, to_email: str, subject: str, html_body: str, text_body: str) -> bool:
        """發送郵件"""
        try:
            # 檢查配置
            if not current_app.config.get('MAIL_SERVER'):
                current_app.logger.warning("Mail server not configured, skipping email send")
                return False
            
            # 創建郵件
            msg = MimeMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = current_app.config['MAIL_DEFAULT_SENDER']
            msg['To'] = to_email
            
            # 添加文字和 HTML 內容
            text_part = MimeText(text_body, 'plain', 'utf-8')
            html_part = MimeText(html_body, 'html', 'utf-8')
            
            msg.attach(text_part)
            msg.attach(html_part)
            
            # 發送郵件
            server = smtplib.SMTP(
                current_app.config['MAIL_SERVER'], 
                current_app.config['MAIL_PORT']
            )
            
            if current_app.config['MAIL_USE_TLS']:
                server.starttls()
            
            if current_app.config['MAIL_USERNAME']:
                server.login(
                    current_app.config['MAIL_USERNAME'],
                    current_app.config['MAIL_PASSWORD']
                )
            
            server.send_message(msg)
            server.quit()
            
            current_app.logger.info(f"Email sent to {to_email}: {subject}")
            return True
            
        except Exception as e:
            current_app.logger.error(f"Failed to send email to {to_email}: {e}")
            return False
    
    def send_ticket_created_guest(self, ticket_data: Dict[str, Any]) -> bool:
        """發送訪客工單建立通知"""
        try:
            # 生成追蹤連結
            secret_key = current_app.config.get('SECRET_KEY', 'dev-secret')
            tracking_token = SupportService.generate_guest_token(
                ticket_data['ticket_id'], 
                ticket_data['guest_email'], 
                secret_key
            )
            
            base_url = current_app.config.get('SUPPORT_BASE_URL', 'http://localhost:12005')
            tracking_url = urljoin(base_url, f"/track?ticket_id={ticket_data['public_id']}&token={tracking_token}")
            
            # 準備模板變數
            variables = {
                'ticket_id': ticket_data['public_id'],
                'subject': ticket_data['subject'],
                'category': ticket_data['category'],
                'priority': ticket_data['priority'],
                'body': ticket_data.get('body', ''),
                'created_at': ticket_data['created_at'],
                'tracking_url': tracking_url
            }
            
            # 渲染模板
            subject, html_body, text_body = self._render_template(
                EmailTemplates.TICKET_CREATED_GUEST, 
                variables
            )
            
            # 發送郵件
            return self._send_email(
                ticket_data['guest_email'],
                subject,
                html_body,
                text_body
            )
            
        except Exception as e:
            current_app.logger.error(f"Failed to send ticket created email: {e}")
            return False
    
    def send_admin_replied(self, ticket_data: Dict[str, Any], reply_data: Dict[str, Any]) -> bool:
        """發送管理員回覆通知"""
        try:
            # 決定收件人
            if ticket_data.get('user_email'):
                to_email = ticket_data['user_email']
            elif ticket_data.get('guest_email'):
                to_email = ticket_data['guest_email']
            else:
                current_app.logger.warning(f"No email found for ticket {ticket_data['public_id']}")
                return False
            
            # 生成追蹤連結
            tracking_url = self._get_tracking_url(ticket_data)
            
            # 準備模板變數
            variables = {
                'ticket_id': ticket_data['public_id'],
                'subject': ticket_data['subject'],
                'status': ticket_data['status'],
                'reply_body': reply_data['body'],
                'reply_time': reply_data['created_at'],
                'tracking_url': tracking_url
            }
            
            # 渲染模板
            subject, html_body, text_body = self._render_template(
                EmailTemplates.ADMIN_REPLIED,
                variables
            )
            
            # 發送郵件
            return self._send_email(to_email, subject, html_body, text_body)
            
        except Exception as e:
            current_app.logger.error(f"Failed to send admin replied email: {e}")
            return False
    
    def send_ticket_resolved(self, ticket_data: Dict[str, Any], resolution_note: Optional[str] = None) -> bool:
        """發送工單已解決通知"""
        try:
            # 決定收件人
            if ticket_data.get('user_email'):
                to_email = ticket_data['user_email']
            elif ticket_data.get('guest_email'):
                to_email = ticket_data['guest_email']
            else:
                current_app.logger.warning(f"No email found for ticket {ticket_data['public_id']}")
                return False
            
            # 生成追蹤連結
            tracking_url = self._get_tracking_url(ticket_data)
            
            # 準備模板變數
            variables = {
                'ticket_id': ticket_data['public_id'],
                'subject': ticket_data['subject'],
                'resolution_note': resolution_note,
                'tracking_url': tracking_url
            }
            
            # 渲染模板
            subject, html_body, text_body = self._render_template(
                EmailTemplates.TICKET_RESOLVED,
                variables
            )
            
            # 發送郵件
            return self._send_email(to_email, subject, html_body, text_body)
            
        except Exception as e:
            current_app.logger.error(f"Failed to send ticket resolved email: {e}")
            return False
    
    def _get_tracking_url(self, ticket_data: Dict[str, Any]) -> str:
        """生成追蹤連結"""
        base_url = current_app.config.get('SUPPORT_BASE_URL', 'http://localhost:12005')
        
        # 如果是訪客工單，生成簽章連結
        if ticket_data.get('guest_email'):
            secret_key = current_app.config.get('SECRET_KEY', 'dev-secret')
            tracking_token = SupportService.generate_guest_token(
                ticket_data['ticket_id'],
                ticket_data['guest_email'],
                secret_key
            )
            return urljoin(base_url, f"/track?ticket_id={ticket_data['public_id']}&token={tracking_token}")
        else:
            # 登入用戶直接連到工單頁面
            return urljoin(base_url, f"/support/ticket/{ticket_data['public_id']}")


# 全域 Email 服務實例
email_service = EmailService()