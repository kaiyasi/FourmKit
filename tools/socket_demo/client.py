#!/usr/bin/env python3
"""
Simple Socket Client Demo for ForumKit
Can be used by pytest and demo.sh for testing
"""

import socket
import json
import time
import sys
import logging
from typing import Dict, Any, Optional, List

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SocketClient:
    def __init__(self, host: str = '127.0.0.1', port: int = 9999, timeout: float = 5.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.sock: Optional[socket.socket] = None
        
    def connect(self) -> bool:
        """Connect to the server"""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(self.timeout)
            self.sock.connect((self.host, self.port))
            logger.info(f"Connected to {self.host}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from server"""
        if self.sock:
            try:
                self.sock.close()
                logger.info("Disconnected from server")
            except:
                pass
            self.sock = None
    
    def send_message(self, message: str) -> Optional[Dict[str, Any]]:
        """Send a plain text message"""
        if not self.sock:
            logger.error("Not connected to server")
            return None
        
        try:
            self.sock.send(message.encode('utf-8'))
            response = self.sock.recv(4096).decode('utf-8').strip()
            return json.loads(response)
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            return None
    
    def send_json(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Send a JSON message"""
        if not self.sock:
            logger.error("Not connected to server")
            return None
        
        try:
            message = json.dumps(data)
            self.sock.send(message.encode('utf-8'))
            response = self.sock.recv(4096).decode('utf-8').strip()
            return json.loads(response)
        except Exception as e:
            logger.error(f"Failed to send JSON: {e}")
            return None
    
    def run_tests(self) -> List[Dict[str, Any]]:
        """Run a series of tests and return results"""
        results = []
        
        if not self.connect():
            return [{"test": "connection", "passed": False, "error": "Failed to connect"}]
        
        try:
            # Test 1: Simple echo
            logger.info("Test 1: Simple echo")
            response = self.send_message("Hello, World!")
            results.append({
                "test": "simple_echo",
                "passed": response is not None and "echo" in response.get("type", ""),
                "response": response
            })
            
            # Test 2: JSON ping
            logger.info("Test 2: JSON ping")
            response = self.send_json({"type": "ping"})
            results.append({
                "test": "json_ping",
                "passed": response is not None and response.get("type") == "pong",
                "response": response
            })
            
            # Test 3: JSON echo with payload
            logger.info("Test 3: JSON echo with payload")
            response = self.send_json({"type": "echo", "data": "test_payload"})
            results.append({
                "test": "json_echo",
                "passed": response is not None and response.get("type") == "echo_response",
                "response": response
            })
            
            # Test 4: Large payload
            logger.info("Test 4: Large payload")
            large_payload = {"data": "x" * 1000, "numbers": list(range(100))}
            response = self.send_json({"type": "test_payload", "payload": large_payload})
            results.append({
                "test": "large_payload",
                "passed": response is not None and response.get("processed") is True,
                "response": response
            })
            
            # Test 5: Invalid JSON (should handle gracefully)
            logger.info("Test 5: Invalid JSON handling")
            response = self.send_message("{invalid_json:")
            results.append({
                "test": "invalid_json",
                "passed": response is not None and "echo" in response.get("type", ""),
                "response": response
            })
            
        except Exception as e:
            logger.error(f"Test execution error: {e}")
            results.append({
                "test": "execution_error",
                "passed": False,
                "error": str(e)
            })
        finally:
            self.disconnect()
        
        return results
    
    def run_stress_test(self, num_messages: int = 10) -> Dict[str, Any]:
        """Run stress test with multiple rapid messages"""
        if not self.connect():
            return {"passed": False, "error": "Failed to connect"}
        
        try:
            start_time = time.time()
            successful = 0
            failed = 0
            
            for i in range(num_messages):
                response = self.send_json({"type": "ping", "sequence": i})
                if response and response.get("type") == "pong":
                    successful += 1
                else:
                    failed += 1
            
            end_time = time.time()
            duration = end_time - start_time
            
            return {
                "passed": failed == 0,
                "successful": successful,
                "failed": failed,
                "duration": duration,
                "messages_per_second": num_messages / duration if duration > 0 else 0
            }
            
        except Exception as e:
            return {"passed": False, "error": str(e)}
        finally:
            self.disconnect()

def main():
    """Main entry point for command-line usage"""
    if len(sys.argv) < 2:
        print("Usage: python client.py <test|stress> [host] [port]")
        sys.exit(1)
    
    mode = sys.argv[1]
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 9999
    
    client = SocketClient(host, port)
    
    if mode == "test":
        logger.info("Running socket tests...")
        results = client.run_tests()
        
        passed = sum(1 for r in results if r.get("passed", False))
        total = len(results)
        
        print(f"\nTest Results: {passed}/{total} passed")
        for result in results:
            status = "PASS" if result.get("passed", False) else "FAIL"
            print(f"  {result['test']}: {status}")
            if not result.get("passed", False) and "error" in result:
                print(f"    Error: {result['error']}")
        
        sys.exit(0 if passed == total else 1)
        
    elif mode == "stress":
        logger.info("Running stress test...")
        result = client.run_stress_test(50)
        
        if result["passed"]:
            print(f"Stress test PASSED: {result['successful']} messages in {result['duration']:.2f}s")
            print(f"Rate: {result['messages_per_second']:.1f} msg/s")
        else:
            print(f"Stress test FAILED: {result.get('error', 'Unknown error')}")
        
        sys.exit(0 if result["passed"] else 1)
    else:
        print(f"Unknown mode: {mode}")
        sys.exit(1)

if __name__ == "__main__":
    main()