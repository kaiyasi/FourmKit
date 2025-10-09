#!/usr/bin/env python3
"""
Acceptance test: HTTP/Socket health checks
Verifies all endpoints and services are responding correctly
"""

import requests
import socket
import json
import time
import sys
from typing import Dict, List, Tuple, Optional

class HealthChecker:
    def __init__(self, base_url: str = "http://localhost:12005", cdn_url: str = "http://localhost:12002"):
        self.base_url = base_url.rstrip('/')
        self.cdn_url = cdn_url.rstrip('/')
        self.api_url = f"{self.base_url}/api"
        self.results = []
        
    def log(self, message: str, success: bool = True):
        """Log result and store for summary"""
        status = "✓" if success else "✗"
        print(f"{status} {message}")
        self.results.append({"message": message, "success": success})
    
    def check_http_endpoint(self, name: str, url: str, expected_status: int = 200, 
                          timeout: float = 5.0, check_content: Optional[str] = None) -> bool:
        """Check HTTP endpoint with optional content verification"""
        try:
            response = requests.get(url, timeout=timeout)
            
            if response.status_code == expected_status:
                if check_content and check_content not in response.text:
                    self.log(f"{name} - Content check failed", False)
                    return False
                else:
                    self.log(f"{name} - HTTP {response.status_code}")
                    return True
            else:
                self.log(f"{name} - Expected {expected_status}, got {response.status_code}", False)
                return False
                
        except requests.exceptions.RequestException as e:
            self.log(f"{name} - Connection failed: {e}", False)
            return False
    
    def check_json_endpoint(self, name: str, url: str, required_fields: List[str] = None) -> bool:
        """Check JSON API endpoint with field validation"""
        try:
            response = requests.get(url, timeout=5.0)
            
            if response.status_code != 200:
                self.log(f"{name} - HTTP {response.status_code}", False)
                return False
            
            try:
                data = response.json()
            except json.JSONDecodeError:
                self.log(f"{name} - Invalid JSON response", False)
                return False
            
            if required_fields:
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    self.log(f"{name} - Missing fields: {missing_fields}", False)
                    return False
            
            self.log(f"{name} - JSON API responding")
            return True
            
        except requests.exceptions.RequestException as e:
            self.log(f"{name} - Connection failed: {e}", False)
            return False
    
    def check_socket_service(self, name: str, host: str = "127.0.0.1", port: int = 9101, 
                           message: str = "ping", expected: str = "pong") -> bool:
        """Check raw socket service"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3.0)
            sock.connect((host, port))
            
            # Send message
            sock.send(f"{message}\n".encode('utf-8'))
            
            # Receive response
            response = sock.recv(1024).decode('utf-8').strip()
            sock.close()
            
            if response == expected:
                self.log(f"{name} - Socket responding correctly")
                return True
            else:
                self.log(f"{name} - Expected '{expected}', got '{response}'", False)
                return False
                
        except Exception as e:
            self.log(f"{name} - Socket connection failed: {e}", False)
            return False
    
    def check_port_accessibility(self, name: str, host: str, port: int) -> bool:
        """Check if port is accessible (for internal services)"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            result = sock.connect_ex((host, port))
            sock.close()
            
            if result == 0:
                self.log(f"{name} - Port {port} accessible")
                return True
            else:
                self.log(f"{name} - Port {port} not accessible", False)
                return False
                
        except Exception as e:
            self.log(f"{name} - Port check failed: {e}", False)
            return False
    
    def run_all_checks(self) -> bool:
        """Run comprehensive health checks"""
        print("=== ForumKit Health Check ===")
        
        success_count = 0
        total_checks = 0
        
        # Core API Health Checks
        checks = [
            # Basic endpoints
            ("Frontend Root", lambda: self.check_http_endpoint(
                "Frontend", self.base_url, check_content="html")),
            
            ("API Status", lambda: self.check_json_endpoint(
                "API Status", f"{self.api_url}/status", ["status"])),
            
            ("API Health", lambda: self.check_json_endpoint(
                "API Health", f"{self.api_url}/healthz")),
            
            # CDN Service
            ("CDN Service", lambda: self.check_http_endpoint(
                "CDN", self.cdn_url, expected_status=[200, 403, 404])),
            
            # Socket Services
            ("Socket Health", lambda: self.check_socket_service("Socket Health")),
            
            # Port Accessibility
            ("PostgreSQL Port", lambda: self.check_port_accessibility("PostgreSQL", "127.0.0.1", 12007)),
            ("Redis Port", lambda: self.check_port_accessibility("Redis", "127.0.0.1", 12008)),
            
            # API Functionality
            ("Posts List", lambda: self.check_json_endpoint(
                "Posts List", f"{self.api_url}/posts/list")),
        ]
        
        for check_name, check_func in checks:
            total_checks += 1
            try:
                if check_func():
                    success_count += 1
            except Exception as e:
                self.log(f"{check_name} - Unexpected error: {e}", False)
        
        # Additional checks
        self.check_security_headers()
        self.check_cors_handling()
        
        return success_count == total_checks
    
    def check_security_headers(self):
        """Check security headers are present"""
        try:
            response = requests.get(self.base_url, timeout=5)
            headers = response.headers
            
            security_headers = [
                'x-content-type-options',
                'x-frame-options',
                'referrer-policy'
            ]
            
            present = sum(1 for header in security_headers if header in headers)
            if present >= 2:
                self.log(f"Security Headers - {present}/{len(security_headers)} present")
            else:
                self.log(f"Security Headers - Only {present}/{len(security_headers)} present", False)
                
        except Exception as e:
            self.log(f"Security Headers - Check failed: {e}", False)
    
    def check_cors_handling(self):
        """Check CORS headers are handled"""
        try:
            response = requests.options(f"{self.api_url}/status", 
                                      headers={'Origin': 'https://example.com'}, 
                                      timeout=5)
            
            if response.status_code in [200, 204, 405]:
                self.log("CORS Handling - Server responds to preflight")
            else:
                self.log(f"CORS Handling - Unexpected status {response.status_code}", False)
                
        except Exception as e:
            self.log(f"CORS Handling - Check failed: {e}", False)
    
    def check_http_endpoint(self, name: str, url: str, expected_status = 200, 
                          timeout: float = 5.0, check_content: Optional[str] = None) -> bool:
        """Check HTTP endpoint - handles both single status and list"""
        try:
            response = requests.get(url, timeout=timeout)
            
            # Handle both single status code and list of acceptable codes
            if isinstance(expected_status, list):
                status_ok = response.status_code in expected_status
            else:
                status_ok = response.status_code == expected_status
            
            if status_ok:
                if check_content and check_content not in response.text.lower():
                    self.log(f"{name} - Content check failed", False)
                    return False
                else:
                    self.log(f"{name} - HTTP {response.status_code}")
                    return True
            else:
                expected_str = f"{expected_status}" if not isinstance(expected_status, list) else f"one of {expected_status}"
                self.log(f"{name} - Expected {expected_str}, got {response.status_code}", False)
                return False
                
        except requests.exceptions.RequestException as e:
            self.log(f"{name} - Connection failed: {e}", False)
            return False
    
    def print_summary(self):
        """Print test summary"""
        total = len(self.results)
        passed = sum(1 for r in self.results if r['success'])
        failed = total - passed
        
        print(f"\n=== Health Check Summary ===")
        print(f"Total checks: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        
        if failed > 0:
            print("\nFailed checks:")
            for result in self.results:
                if not result['success']:
                    print(f"  ✗ {result['message']}")
        
        success_rate = (passed / total * 100) if total > 0 else 0
        print(f"Success rate: {success_rate:.1f}%")
        
        return failed == 0

def main():
    """Main entry point"""
    checker = HealthChecker()
    
    try:
        success = checker.run_all_checks()
        overall_success = checker.print_summary()
        
        if overall_success:
            print("\n🎉 All health checks PASSED")
            sys.exit(0)
        else:
            print("\n❌ Some health checks FAILED")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⚠️  Health check interrupted")
        sys.exit(2)
    except Exception as e:
        print(f"\n💥 Health check error: {e}")
        sys.exit(3)

if __name__ == "__main__":
    main()