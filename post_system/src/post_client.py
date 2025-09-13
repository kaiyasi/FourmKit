#!/usr/bin/env python3
"""
Socket 客戶端，用於與 Instagram Post Server 通訊
展示即時通訊能力 - 成大資工乙組特殊選材重點
"""
import socket
import json
import time
import threading
import logging
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class PostRequest:
    """發文請求資料"""
    user_token: str
    page_id: str
    image_url: str = ""
    image_urls: Optional[list] = None
    caption: str = ""
    request_id: Optional[str] = None

class PostClient:
    """
    Instagram 發布客戶端
    與 PostServer 進行 Socket 通訊
    """
    
    def __init__(self, server_host: str = "localhost", server_port: int = 8888):
        self.server_host = server_host
        self.server_port = server_port
        self.socket = None
        self.connected = False
        self.response_handler = None
        
        # 設定 logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    def connect(self) -> bool:
        """連接到伺服器"""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((self.server_host, self.server_port))
            self.connected = True
            
            logger.info(f"🔗 已連接到 Instagram Post Server")
            logger.info(f"   - 伺服器: {self.server_host}:{self.server_port}")
            
            # 啟動回應監聽執行緒
            response_thread = threading.Thread(
                target=self._listen_responses,
                daemon=True
            )
            response_thread.start()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ 連接伺服器失敗: {e}")
            self.connected = False
            return False
    
    def disconnect(self):
        """中斷與伺服器的連接"""
        if self.socket:
            try:
                self.socket.close()
                self.connected = False
                logger.info("🔚 已中斷與伺服器的連接")
            except:
                pass
    
    def post_to_instagram(self, request: PostRequest) -> bool:
        """發送 Instagram 發文請求"""
        if not self.connected:
            logger.error("❌ 未連接到伺服器")
            return False
        
        try:
            # 生成請求 ID
            if not request.request_id:
                request.request_id = f"req_{int(time.time() * 1000)}"
            
            # 準備請求資料
            request_data = {
                'request_id': request.request_id,
                'user_token': request.user_token,
                'page_id': request.page_id,
                'caption': request.caption
            }
            if request.image_urls:
                request_data['image_urls'] = request.image_urls
            else:
                request_data['image_url'] = request.image_url
            
            logger.info(f"📤 發送 Instagram 發文請求")
            logger.info(f"   - 請求 ID: {request.request_id}")
            logger.info(f"   - Page ID: {request.page_id}")
            if request.image_urls:
                logger.info(f"   - 輪播圖片數: {len(request.image_urls)}")
            else:
                logger.info(f"   - 圖片 URL: {request.image_url}")
            
            # 發送請求
            request_json = json.dumps(request_data, ensure_ascii=False) + "\n"
            self.socket.send(request_json.encode('utf-8'))
            
            logger.info("✅ 請求已發送，等待伺服器回應...")
            return True
            
        except Exception as e:
            logger.error(f"❌ 發送請求失敗: {e}")
            return False
    
    def _listen_responses(self):
        """監聽伺服器回應（NDJSON：以換行分隔的 JSON）"""
        buffer = ""
        try:
            while self.connected and self.socket:
                try:
                    chunk = self.socket.recv(4096).decode('utf-8')
                    if not chunk:
                        break
                    buffer += chunk
                    # 逐行解析（支援一次收到多則或半則訊息）
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            response = json.loads(line)
                        except json.JSONDecodeError as e:
                            logger.error(f"❌ JSON 解析失敗（line）: {e}")
                            continue
                        self._handle_response(response)
                except Exception as e:
                    logger.error(f"❌ 接收回應失敗: {e}")
        except Exception as e:
            logger.error(f"❌ 監聽回應異常: {e}")
        logger.info("🔚 回應監聽執行緒結束")
    
    def _handle_response(self, response: Dict[str, Any]):
        """處理伺服器回應"""
        request_id = response.get('request_id', 'unknown')
        success = response.get('success', False)
        message = response.get('message', '')
        
        if success:
            logger.info(f"✅ 伺服器回應 [{request_id}]: {message}")
            
            # 如果有發文結果資料
            data = response.get('data')
            if data:
                post_id = data.get('post_id')
                post_url = data.get('post_url')
                if post_id and post_url:
                    logger.info(f"🎉 Instagram 發文成功！")
                    logger.info(f"   - Post ID: {post_id}")
                    logger.info(f"   - Post URL: {post_url}")
        else:
            logger.error(f"❌ 伺服器回應 [{request_id}]: {message}")
            error = response.get('error')
            if error:
                logger.error(f"   - 錯誤詳情: {error}")
        
        # 如果有自訂回應處理器
        if self.response_handler:
            try:
                self.response_handler(response)
            except Exception as e:
                logger.error(f"❌ 自訂回應處理器錯誤: {e}")
    
    def set_response_handler(self, handler: Callable[[Dict[str, Any]], None]):
        """設定自訂回應處理器"""
        self.response_handler = handler
    
    def is_connected(self) -> bool:
        """檢查是否已連接"""
        return self.connected


def interactive_demo():
    """互動式示範"""
    print("🎭 Instagram Post Client 互動式示範")
    print("=" * 50)
    
    # 建立客戶端
    client = PostClient()
    
    # 連接伺服器
    print("🔗 正在連接伺服器...")
    if not client.connect():
        print("❌ 連接失敗，請確認伺服器是否啟動")
        return
    
    try:
        while True:
            print("\n📋 請輸入發文資料：")
            
            # 取得用戶輸入
            user_token = input("User Token: ").strip()
            if not user_token:
                print("❌ User Token 不能為空")
                continue
                
            page_id = input("Page ID: ").strip()
            if not page_id:
                print("❌ Page ID 不能為空")
                continue
            
            mode = input("發文模式 單圖=1 / 輪播=2 (預設 1): ").strip() or "1"
            image_url = ""
            image_urls = None
            if mode == "2":
                raw = input("多張圖片 URL（逗號分隔，至少 2 張）: ").strip()
                if raw:
                    image_urls = [u.strip() for u in raw.split(',') if u.strip()]
                if not image_urls or len(image_urls) < 2:
                    print("❌ 輪播需要至少 2 張圖片")
                    continue
            else:
                image_url = input("圖片 URL (預設測試圖): ").strip()
                if not image_url:
                    image_url = "https://picsum.photos/1080/1080"
                
            caption = input("文案 (可選): ").strip()
            
            # 建立請求
            request = PostRequest(
                user_token=user_token,
                page_id=page_id,
                image_url=image_url,
                image_urls=image_urls,
                caption=caption or f"測試發文 - {time.strftime('%Y-%m-%d %H:%M:%S')}"
            )
            
            # 發送請求
            if client.post_to_instagram(request):
                print("✅ 請求已發送，請等待處理結果...")
            else:
                print("❌ 發送請求失敗")
            
            # 詢問是否繼續
            continue_choice = input("\n🤔 是否繼續測試？(y/N): ").strip().lower()
            if continue_choice != 'y':
                break
                
    except KeyboardInterrupt:
        print("\n🛑 收到中斷信號")
    
    finally:
        print("🔚 正在斷開連接...")
        client.disconnect()
        print("👋 掰掰！")


def test_demo():
    """測試示範（自動化）"""
    print("🧪 Instagram Post Client 測試示範")
    print("=" * 50)
    
    client = PostClient()
    
    # 連接測試
    print("🔗 測試連接...")
    if not client.connect():
        print("❌ 連接失敗")
        return
    
    print("✅ 連接成功")
    
    # 模擬發文請求（使用假資料）
    test_request = PostRequest(
        user_token="TEST_TOKEN",
        page_id="TEST_PAGE_ID", 
        image_url="https://picsum.photos/800/600",
        caption="這是測試發文，來自 Socket 客戶端！"
    )
    
    print("📤 發送測試請求...")
    if client.post_to_instagram(test_request):
        print("✅ 測試請求已發送")
        
        # 等待回應
        time.sleep(2)
    else:
        print("❌ 測試請求發送失敗")
    
    # 斷開連接
    print("🔚 斷開連接...")
    client.disconnect()
    print("✅ 測試完成")


def main():
    """主程式"""
    print("🎯 Instagram Post Client")
    print("選擇模式:")
    print("1. 互動式示範 (需要真實 Token)")
    print("2. 連接測試 (使用假資料)")
    
    choice = input("請選擇 (1/2): ").strip()
    
    if choice == "1":
        interactive_demo()
    elif choice == "2":
        test_demo()
    else:
        print("❌ 無效選擇")


if __name__ == "__main__":
    main()
