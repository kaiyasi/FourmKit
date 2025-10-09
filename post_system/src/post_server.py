#!/usr/bin/env python3
"""
Socket 基礎的 Instagram 發布伺服器
成大資工乙組特殊選材重點：即時通訊 + 非同步處理
"""
import socket
import json
import threading
import logging
import logging.handlers
import time
import queue
import argparse
import http.server
import socketserver
import os
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor
import traceback

from instagram_client import InstagramClient, create_instagram_client, PostResult

logger = logging.getLogger(__name__)

class HealthCheckHandler(http.server.BaseHTTPRequestHandler):
    """健康檢查 HTTP 處理器"""
    
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            health_data = {
                'status': 'healthy',
                'service': 'Instagram Post Server',
                'timestamp': time.time()
            }
            
            self.wfile.write(json.dumps(health_data).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        # 禁用預設日誌以避免干擾
        pass

@dataclass
class PostRequest:
    """發文請求"""
    request_id: str
    account_id: str  # 用於實現單一帳號序列化
    user_token: str
    page_id: str
    caption: str
    client_address: tuple
    image_url: str = ""
    image_urls: Optional[list] = None

@dataclass
class PostResponse:
    """發文回應"""
    request_id: str
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class PostServer:
    """
    Instagram 發布伺服器 (優化版)
    - 新增單一帳號序列化處理，避免帳號級別的衝突
    - 為每個請求創建獨立的 IG Client，確保執行緒安全
    """
    
    def __init__(self, host: str = "localhost", port: int = 8888, max_workers: int = 5, health_port: int = None):
        self.host = host
        self.port = port
        self.health_port = health_port or port
        self.max_workers = max_workers
        self.socket = None
        self.health_server = None
        self.running = False
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.active_connections = {}  # client_id -> socket
        
        # 用於單一帳號序列化處理的鎖和集合
        self.account_lock = threading.Lock()
        self.processing_accounts = set()
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
    def start_server(self):
        """啟動 Socket 伺服器和健康檢查伺服器"""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind((self.host, self.port))
            self.socket.listen(10)
            self.running = True
            
            self._start_health_server()
            
            logger.info(f"📡 Instagram Post Server 啟動成功 (優化版)")
            logger.info(f"   - Socket 監聽: {self.host}:{self.port}")
            logger.info(f"   - 健康檢查: http://{self.host}:{self.health_port}/health")
            logger.info(f"   - 最大工作執行緒: {self.max_workers}")
            
            while self.running:
                try:
                    client_socket, client_address = self.socket.accept()
                    logger.info(f"🔗 新連線來自: {client_address}")
                    
                    client_thread = threading.Thread(
                        target=self._handle_client,
                        args=(client_socket, client_address),
                        daemon=True
                    )
                    client_thread.start()
                    
                except socket.error as e:
                    if self.running:
                        logger.error(f"Socket 錯誤: {e}")
                    
        except Exception as e:
            logger.error(f"❌ 伺服器啟動失敗: {e}")
            raise
            
    def _handle_client(self, client_socket: socket.socket, client_address: tuple):
        client_id = f"{client_address[0]}:{client_address[1]}"
        self.active_connections[client_id] = client_socket
        
        try:
            logger.info(f"👤 開始處理客戶端: {client_id}")
            buffer = ""
            while self.running:
                chunk = client_socket.recv(4096).decode('utf-8')
                if not chunk:
                    break
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    if not line.strip():
                        continue
                    self._process_request_line(line, client_socket, client_address, client_id)
        
        except Exception as e:
            logger.error(f"❌ 客戶端處理異常 {client_id}: {e}")
            
        finally:
            try:
                client_socket.close()
                if client_id in self.active_connections:
                    del self.active_connections[client_id]
                logger.info(f"🔚 客戶端 {client_id} 連線已關閉")
            except: pass
    
    def _parse_request(self, request_data: Dict[str, Any], client_address: tuple) -> Optional[PostRequest]:
        try:
            return PostRequest(
                request_id=request_data.get('request_id', f"req_{int(time.time())}"),
                # account_id 可選；若未提供，使用單一共享序列化鍵避免併發衝突
                account_id=request_data.get('account_id', 'default'),
                user_token=request_data['user_token'],
                page_id=request_data['page_id'],
                image_url=request_data.get('image_url', ''),
                image_urls=request_data.get('image_urls'),
                caption=request_data.get('caption', ''),
                client_address=client_address
            )
        except KeyError as e:
            logger.error(f"❌ 缺少必要欄位: {e}")
            return None

    def _process_request_line(self, line: str, client_socket: socket.socket, client_address: tuple, client_id: str):
        logger.info(f"📨 收到來自 {client_id} 的請求")
        try:
            request_data = json.loads(line)
            request = self._parse_request(request_data, client_address)

            if request:
                self._send_response(
                    client_socket,
                    PostResponse(request_id=request.request_id, success=True, message="請求已接收，排隊等待處理...")
                )
                future = self.executor.submit(self._process_post_request, request)
                threading.Thread(
                    target=self._handle_post_result,
                    args=(future, client_socket, request.request_id),
                    daemon=True
                ).start()
            else:
                self._send_response(
                    client_socket,
                    PostResponse(request_id="unknown", success=False, message="無效的請求格式")
                )
        except json.JSONDecodeError:
            logger.error(f"❌ JSON 解析失敗，來自 {client_id}")
            self._send_response(client_socket, PostResponse(request_id="unknown", success=False, message="JSON 格式錯誤"))
        except Exception as e:
            logger.error(f"❌ 處理請求失敗: {e}")
            self._send_response(client_socket, PostResponse(request_id="unknown", success=False, message=f"處理錯誤: {str(e)}"))
    
    def _process_post_request(self, request: PostRequest) -> PostResponse:
        """處理 Instagram 發文請求 (加入單一帳號鎖和獨立 Client)"""
        with self.account_lock:
            if request.account_id in self.processing_accounts:
                logger.warning(f"🚦 帳號 {request.account_id} 已有任務在執行，請求 {request.request_id} 將延後。")
                return PostResponse(
                    request_id=request.request_id,
                    success=False,
                    message="Account is busy, try again later.",
                    error="account_busy"
                )
            self.processing_accounts.add(request.account_id)

        try:
            logger.info(f"🔄 開始處理發文請求 {request.request_id} (帳號: {request.account_id})")
            
            # 為每個請求創建獨立的 Client，確保執行緒安全
            instagram_client = create_instagram_client()
            
            if request.image_urls and isinstance(request.image_urls, list) and len(request.image_urls) >= 2:
                result: PostResult = instagram_client.post_carousel(
                    user_token=request.user_token,
                    page_id=request.page_id,
                    image_urls=request.image_urls,
                    caption=request.caption,
                )
            else:
                result: PostResult = instagram_client.post_single_image(
                    user_token=request.user_token,
                    page_id=request.page_id,
                    image_url=request.image_url,
                    caption=request.caption
                )
            
            if result.success:
                logger.info(f"✅ 發文成功 {request.request_id}: {result.post_id}")
                return PostResponse(
                    request_id=request.request_id,
                    success=True,
                    message="Instagram 發文成功！",
                    data={'post_id': result.post_id, 'post_url': result.post_url, 'media_id': result.media_id}
                )
            else:
                logger.error(f"❌ 發文失敗 {request.request_id}: {result.error}")
                return PostResponse(
                    request_id=request.request_id,
                    success=False,
                    message="Instagram 發文失敗",
                    error=result.error
                )
                
        except Exception as e:
            logger.error(f"❌ 處理發文請求異常 {request.request_id}: {e}")
            logger.error(f"❌ 錯誤詳情: {traceback.format_exc()}")
            return PostResponse(
                request_id=request.request_id,
                success=False,
                message="處理發文請求時發生異常",
                error=str(e)
            )
        finally:
            # 無論成功或失敗，都要釋放帳號鎖
            with self.account_lock:
                self.processing_accounts.remove(request.account_id)
                logger.info(f"🟢 帳號 {request.account_id} 鎖已釋放。")

    def _handle_post_result(self, future, client_socket: socket.socket, request_id: str):
        try:
            response = future.result(timeout=600)  # 延長至 10 分鐘
            self._send_response(client_socket, response)
        except Exception as e:
            logger.error(f"❌ 處理發文結果異常 {request_id}: {e}")
            self._send_response(
                client_socket,
                PostResponse(request_id=request_id, success=False, message="處理發文結果時發生異常", error=str(e))
            )
    
    def _send_response(self, client_socket: socket.socket, response: PostResponse):
        try:
            response_json = json.dumps(asdict(response), ensure_ascii=False)
            client_socket.send((response_json + "\n").encode('utf-8'))
            logger.info(f"📤 回應已發送: {response.request_id} - {response.success}")
        except Exception as e:
            logger.error(f"❌ 發送回應失敗: {e}")
    
    def _start_health_server(self):
        try:
            if self.health_port == self.port:
                return
            self.health_server = socketserver.TCPServer((self.host, self.health_port), HealthCheckHandler)
            health_thread = threading.Thread(target=self.health_server.serve_forever, daemon=True)
            health_thread.start()
            logger.info(f"🏥 健康檢查伺服器已啟動在 {self.host}:{self.health_port}")
        except Exception as e:
            logger.warning(f"⚠️ 健康檢查伺服器啟動失敗: {e}")
    
    def stop_server(self):
        logger.info("🛑 正在停止伺服器...")
        self.running = False
        
        for client_id, client_socket in list(self.active_connections.items()):
            try: client_socket.close()
            except: pass
        
        if self.socket:
            try: self.socket.close()
            except: pass
                
        if self.health_server:
            try:
                self.health_server.shutdown()
                self.health_server.server_close()
            except: pass
        
        self.executor.shutdown(wait=True)
        logger.info("✅ 伺服器已停止")
    
    def get_server_status(self) -> Dict[str, Any]:
        return {
            'running': self.running,
            'host': self.host,
            'port': self.port,
            'active_connections': len(self.active_connections),
            'max_workers': self.max_workers,
            'processing_accounts': len(self.processing_accounts)
        }


def parse_args():
    """解析命令列參數"""
    parser = argparse.ArgumentParser(description='Instagram Post Server - Socket 基礎的發布伺服器')
    
    parser.add_argument('--host', default='localhost', help='伺服器監聽 IP (預設: localhost)')
    parser.add_argument('--port', type=int, default=8888, help='伺服器監聽 port (預設: 8888)')
    parser.add_argument('--health-port', type=int, help='健康檢查 port (預設: 與主 port 相同)')
    parser.add_argument('--max-workers', type=int, default=5, help='最大工作執行緒數 (預設: 5)')
    parser.add_argument('--log-level', default='INFO', 
                       choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
                       help='日誌級別 (預設: INFO)')
    
    return parser.parse_args()

def main():
    """主程式"""
    args = parse_args()
    
    # 設定日誌級別與檔案輸出
    root = logging.getLogger()
    root.setLevel(getattr(logging, args.log_level))
    try:
        log_dir = os.environ.get("LOG_DIR", os.path.join(os.getcwd(), "logs"))
        os.makedirs(log_dir, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            os.path.join(log_dir, "ig-post.log"), maxBytes=5*1024*1024, backupCount=3, encoding='utf-8'
        )
        file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        root.addHandler(file_handler)
    except Exception as e:
        print(f"⚠️ 檔案日誌初始化失敗: {e}")
    
    # 建立伺服器
    server = PostServer(
        host=args.host,
        port=args.port,
        max_workers=args.max_workers,
        health_port=args.health_port
    )
    
    try:
        print("🚀 啟動 Instagram Post Server...")
        print(f"   - 監聽: {args.host}:{args.port}")
        print(f"   - 工作執行緒: {args.max_workers}")
        print(f"   - 日誌級別: {args.log_level}")
        if args.health_port:
            print(f"   - 健康檢查: {args.host}:{args.health_port}")
        
        server.start_server()
        
    except KeyboardInterrupt:
        print("\n🛑 收到中斷信號，正在停止伺服器...")
        server.stop_server()
    except Exception as e:
        print(f"❌ 伺服器錯誤: {e}")
        logger.error(f"伺服器異常: {e}", exc_info=True)
        server.stop_server()


if __name__ == "__main__":
    main()
