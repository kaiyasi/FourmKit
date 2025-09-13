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
    user_token: str
    page_id: str
    image_url: str = ""
    image_urls: Optional[list] = None
    caption: str
    client_address: tuple

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
    Instagram 發布伺服器
    使用 Socket 進行即時通訊，ThreadPoolExecutor 處理併發請求
    支援 HTTP 健康檢查端點
    """
    
    def __init__(self, host: str = "localhost", port: int = 8888, max_workers: int = 5, health_port: int = None):
        self.host = host
        self.port = port
        self.health_port = health_port or port  # 健康檢查使用同一個 port
        self.max_workers = max_workers
        self.socket = None
        self.health_server = None
        self.running = False
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.instagram_client = create_instagram_client()
        self.active_connections = {}  # client_id -> socket
        
        # 設定 logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
    def start_server(self):
        """啟動 Socket 伺服器和健康檢查伺服器"""
        try:
            # 啟動 Socket 伺服器
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind((self.host, self.port))
            self.socket.listen(10)
            self.running = True
            
            # 啟動健康檢查 HTTP 伺服器 (在不同執行緒)
            self._start_health_server()
            
            logger.info(f"📡 Instagram Post Server 啟動成功")
            logger.info(f"   - Socket 監聽: {self.host}:{self.port}")
            logger.info(f"   - 健康檢查: http://{self.host}:{self.health_port}/health")
            logger.info(f"   - 最大工作執行緒: {self.max_workers}")
            logger.info(f"   - Socket 通訊已就緒 ✅")
            
            while self.running:
                try:
                    client_socket, client_address = self.socket.accept()
                    logger.info(f"🔗 新連線來自: {client_address}")
                    
                    # 為每個客戶端建立處理執行緒
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
        """處理客戶端連線"""
        client_id = f"{client_address[0]}:{client_address[1]}"
        self.active_connections[client_id] = client_socket
        
        try:
            logger.info(f"👤 開始處理客戶端: {client_id}")
            
            buffer = ""
            while self.running:
                # 接收客戶端訊息（容錯：支援 NDJSON 與單包 JSON）
                chunk = client_socket.recv(4096).decode('utf-8')
                if not chunk:
                    break
                buffer += chunk
                # 先走換行 framing
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    if not line.strip():
                        continue
                    self._process_request_line(line, client_socket, client_address, client_id)
                # 若沒有換行，嘗試把整個 buffer 當成 JSON（兼容舊客戶端）
                if buffer.strip():
                    try:
                        self._process_request_line(buffer, client_socket, client_address, client_id)
                        buffer = ""
                    except json.JSONDecodeError:
                        # 不完整，繼續讀取
                        pass
        
        except Exception as e:
            logger.error(f"❌ 客戶端處理異常 {client_id}: {e}")
            
        finally:
            # 清理連線
            try:
                client_socket.close()
                if client_id in self.active_connections:
                    del self.active_connections[client_id]
                logger.info(f"🔚 客戶端 {client_id} 連線已關閉")
            except:
                pass
    
    def _parse_request(self, request_data: Dict[str, Any], client_address: tuple) -> Optional[PostRequest]:
        """解析客戶端請求"""
        try:
            return PostRequest(
                request_id=request_data.get('request_id', f"req_{int(time.time())}"),
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
        """處理單行 JSON 請求"""
        logger.info(f"📨 收到來自 {client_id} 的請求")
        try:
            request_data = json.loads(line)
            request = self._parse_request(request_data, client_address)

            if request:
                # 立即回應收到請求
                self._send_response(
                    client_socket,
                    PostResponse(
                        request_id=request.request_id,
                        success=True,
                        message="請求已接收，開始處理..."
                    )
                )

                # 提交到執行緒池非同步處理
                future = self.executor.submit(self._process_post_request, request)

                # 非阻塞方式等待結果
                threading.Thread(
                    target=self._handle_post_result,
                    args=(future, client_socket, request.request_id),
                    daemon=True
                ).start()
            else:
                self._send_response(
                    client_socket,
                    PostResponse(
                        request_id="unknown",
                        success=False,
                        message="無效的請求格式"
                    )
                )
        except json.JSONDecodeError:
            logger.error(f"❌ JSON 解析失敗，來自 {client_id}")
            self._send_response(
                client_socket,
                PostResponse(
                    request_id="unknown",
                    success=False,
                    message="JSON 格式錯誤"
                )
            )
        except Exception as e:
            logger.error(f"❌ 處理請求失敗: {e}")
            self._send_response(
                client_socket,
                PostResponse(
                    request_id="unknown",
                    success=False,
                    message=f"處理錯誤: {str(e)}"
                )
            )
        except Exception as e:
            logger.error(f"❌ 解析請求失敗: {e}")
            return None
    
    def _process_post_request(self, request: PostRequest) -> PostResponse:
        """處理 Instagram 發文請求"""
        try:
            logger.info(f"🔄 開始處理發文請求 {request.request_id}")
            logger.info(f"   - Page ID: {request.page_id}")
            if request.image_urls:
                logger.info(f"   - 輪播圖片數: {len(request.image_urls)}")
            else:
                logger.info(f"   - 圖片 URL: {request.image_url}")
            logger.info(f"   - 文案長度: {len(request.caption)}")
            
            # 使用 Instagram 客戶端發布
            if request.image_urls and isinstance(request.image_urls, list) and len(request.image_urls) >= 2:
                result: PostResult = self.instagram_client.post_carousel(
                    user_token=request.user_token,
                    page_id=request.page_id,
                    image_urls=request.image_urls,
                    caption=request.caption,
                )
            else:
                result: PostResult = self.instagram_client.post_single_image(
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
                    data={
                        'post_id': result.post_id,
                        'post_url': result.post_url,
                        'media_id': result.media_id
                    }
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
    
    def _handle_post_result(self, future, client_socket: socket.socket, request_id: str):
        """處理發文結果並回傳給客戶端"""
        try:
            # 等待執行緒完成
            response = future.result(timeout=300)  # 5分鐘逾時
            
            # 發送最終結果給客戶端
            self._send_response(client_socket, response)
            
        except Exception as e:
            logger.error(f"❌ 處理發文結果異常 {request_id}: {e}")
            self._send_response(
                client_socket,
                PostResponse(
                    request_id=request_id,
                    success=False,
                    message="處理發文結果時發生異常",
                    error=str(e)
                )
            )
    
    def _send_response(self, client_socket: socket.socket, response: PostResponse):
        """發送回應給客戶端（NDJSON，每則 JSON 結尾加上換行）"""
        try:
            response_json = json.dumps(asdict(response), ensure_ascii=False)
            # 使用換行作為 framing，避免多則訊息黏包造成 JSON 解析失敗
            client_socket.send((response_json + "\n").encode('utf-8'))
            logger.info(f"📤 回應已發送: {response.request_id} - {response.success}")
        except Exception as e:
            logger.error(f"❌ 發送回應失敗: {e}")
    
    def _start_health_server(self):
        """啟動健康檢查 HTTP 伺服器"""
        try:
            # 如果健康檢查 port 與主 port 相同，則不啟動額外的 HTTP 伺服器
            if self.health_port == self.port:
                return
                
            self.health_server = socketserver.TCPServer(
                (self.host, self.health_port), 
                HealthCheckHandler
            )
            
            # 在背景執行緒中運行健康檢查伺服器
            health_thread = threading.Thread(
                target=self.health_server.serve_forever,
                daemon=True
            )
            health_thread.start()
            
            logger.info(f"🏥 健康檢查伺服器已啟動在 {self.host}:{self.health_port}")
            
        except Exception as e:
            logger.warning(f"⚠️ 健康檢查伺服器啟動失敗: {e}")
    
    def stop_server(self):
        """停止伺服器"""
        logger.info("🛑 正在停止伺服器...")
        self.running = False
        
        # 關閉所有活躍連線
        for client_id, client_socket in list(self.active_connections.items()):
            try:
                client_socket.close()
            except:
                pass
        
        # 關閉主 socket
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
                
        # 關閉健康檢查伺服器
        if self.health_server:
            try:
                self.health_server.shutdown()
                self.health_server.server_close()
            except:
                pass
        
        # 關閉執行緒池
        self.executor.shutdown(wait=True)
        logger.info("✅ 伺服器已停止")
    
    def get_server_status(self) -> Dict[str, Any]:
        """取得伺服器狀態"""
        return {
            'running': self.running,
            'host': self.host,
            'port': self.port,
            'active_connections': len(self.active_connections),
            'max_workers': self.max_workers
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
