#!/usr/bin/env python3
"""
Simple Socket Server Demo for ForumKit
Demonstrates echo server with JSON payload support, timeout and error handling
"""

import socket
import json
import threading
import time
from typing import Dict, Any, Optional
import sys
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SocketServer:
    def __init__(self, host: str = '127.0.0.1', port: int = 9999):
        self.host = host
        self.port = port
        self.running = False
        self.sock: Optional[socket.socket] = None
        
    def start(self):
        """Start the socket server"""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.sock.settimeout(1.0)  # Allow checking for shutdown
            self.sock.bind((self.host, self.port))
            self.sock.listen(5)
            self.running = True
            
            logger.info(f"Socket server started on {self.host}:{self.port}")
            
            while self.running:
                try:
                    client_sock, address = self.sock.accept()
                    logger.info(f"Connection from {address}")
                    
                    # Handle each client in a separate thread
                    thread = threading.Thread(
                        target=self.handle_client,
                        args=(client_sock, address),
                        daemon=True
                    )
                    thread.start()
                    
                except socket.timeout:
                    continue  # Check if we should keep running
                except OSError:
                    if self.running:
                        logger.error("Socket error during accept")
                    break
                    
        except Exception as e:
            logger.error(f"Failed to start server: {e}")
            raise
        finally:
            self.stop()
            
    def handle_client(self, client_sock: socket.socket, address: tuple):
        """Handle individual client connection"""
        try:
            client_sock.settimeout(10.0)  # 10 second timeout per operation
            
            while True:
                try:
                    # Receive data
                    data = client_sock.recv(4096)
                    if not data:
                        break
                        
                    message = data.decode('utf-8').strip()
                    logger.info(f"Received from {address}: {message}")
                    
                    # Try to parse as JSON first
                    try:
                        json_data = json.loads(message)
                        response = self.handle_json_message(json_data)
                    except json.JSONDecodeError:
                        # Fallback to simple echo
                        response = {"type": "echo", "original": message, "timestamp": time.time()}
                    
                    # Send response
                    response_str = json.dumps(response) + "\n"
                    client_sock.send(response_str.encode('utf-8'))
                    
                except socket.timeout:
                    logger.warning(f"Client {address} timed out")
                    break
                except ConnectionResetError:
                    logger.info(f"Client {address} disconnected")
                    break
                except Exception as e:
                    logger.error(f"Error handling client {address}: {e}")
                    error_response = {"type": "error", "message": str(e)}
                    try:
                        client_sock.send(json.dumps(error_response).encode('utf-8'))
                    except:
                        pass
                    break
                    
        except Exception as e:
            logger.error(f"Client handler error for {address}: {e}")
        finally:
            try:
                client_sock.close()
                logger.info(f"Closed connection to {address}")
            except:
                pass
    
    def handle_json_message(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle JSON messages with different types"""
        msg_type = data.get("type", "unknown")
        
        if msg_type == "ping":
            return {"type": "pong", "timestamp": time.time()}
        elif msg_type == "echo":
            return {"type": "echo_response", "data": data.get("data"), "timestamp": time.time()}
        elif msg_type == "test_payload":
            # Simulate some processing
            payload = data.get("payload", {})
            return {
                "type": "test_response",
                "processed": True,
                "payload_size": len(str(payload)),
                "timestamp": time.time()
            }
        else:
            return {
                "type": "unknown_type",
                "received_type": msg_type,
                "timestamp": time.time()
            }
    
    def stop(self):
        """Stop the server"""
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
        logger.info("Server stopped")

def main():
    """Main entry point"""
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    else:
        port = 9999
    
    server = SocketServer(port=port)
    
    try:
        server.start()
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
        server.stop()
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()