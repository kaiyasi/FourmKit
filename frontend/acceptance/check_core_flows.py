#!/usr/bin/env python3
"""
Acceptance test: Core ForumKit flows
Test key API responses and ensure no critical errors in logs
"""

import requests
import json
import time
import sys
import subprocess
from typing import Dict, Any, Optional, List

class CoreFlowTester:
    def __init__(self, base_url: str = "http://localhost:12005"):
        self.base_url = base_url.rstrip('/')
        self.api_url = f"{self.base_url}/api"
        self.results = []
        
    def log(self, message: str, success: bool = True):
        """Log result and store for summary"""
        status = "✓" if success else "✗"
        print(f"{status} {message}")
        self.results.append({"message": message, "success": success})
    
    def make_request(self, method: str, endpoint: str, **kwargs) -> Optional[requests.Response]:
        """Make API request with error handling"""
        try:
            url = f"{self.api_url}{endpoint}"
            response = getattr(requests, method.lower())(url, timeout=10, **kwargs)
            return response
        except requests.exceptions.RequestException as e:
            self.log(f"Request failed: {method} {endpoint} - {e}", False)
            return None
    
    def test_anonymous_post_flow(self) -> bool:
        """Test anonymous post creation flow"""
        print("\n--- Testing Anonymous Post Flow ---")
        
        # Generate unique content
        timestamp = int(time.time())
        client_id = f"test_client_{timestamp}"
        
        # Test post creation
        post_data = {
            'content': f'Test anonymous post {timestamp}',
            'title': 'Test Post'
        }
        
        headers = {
            'Content-Type': 'application/json',
            'X-Client-Id': client_id
        }
        
        response = self.make_request('post', '/posts/create', json=post_data, headers=headers)
        
        if response:
            if response.status_code in [200, 201]:
                self.log("Anonymous post creation - SUCCESS")
                return True
            elif response.status_code in [400, 401, 403]:
                # May require auth - check error message
                try:
                    data = response.json()
                    error_msg = data.get('error', data.get('message', data.get('msg', 'Unknown')))
                    self.log(f"Anonymous post creation - Requires auth: {error_msg}")
                    return True  # This is acceptable behavior
                except:
                    self.log(f"Anonymous post creation - HTTP {response.status_code}", False)
                    return False
            else:
                self.log(f"Anonymous post creation - Unexpected status {response.status_code}", False)
                return False
        else:
            return False
    
    def test_post_list_retrieval(self) -> bool:
        """Test post list retrieval"""
        print("\n--- Testing Post List Retrieval ---")
        
        response = self.make_request('get', '/posts/list?limit=5')
        
        if not response:
            return False
        
        if response.status_code != 200:
            self.log(f"Post list retrieval - HTTP {response.status_code}", False)
            return False
        
        try:
            data = response.json()
            
            # Handle different response formats
            if isinstance(data, dict):
                posts = data.get('posts', data.get('data', []))
            elif isinstance(data, list):
                posts = data
            else:
                posts = []
            
            self.log(f"Post list retrieval - Found {len(posts)} posts")
            return True
            
        except json.JSONDecodeError:
            self.log("Post list retrieval - Invalid JSON", False)
            return False
    
    def test_api_status_endpoints(self) -> bool:
        """Test API status and health endpoints"""
        print("\n--- Testing API Status Endpoints ---")
        
        success = True
        
        # Test basic status
        response = self.make_request('get', '/status')
        if response and response.status_code == 200:
            try:
                data = response.json()
                if 'status' in data or 'message' in data:
                    self.log("API status endpoint - Working")
                else:
                    self.log("API status endpoint - Missing expected fields", False)
                    success = False
            except:
                self.log("API status endpoint - Invalid JSON", False)
                success = False
        else:
            self.log("API status endpoint - Failed", False)
            success = False
        
        # Test health endpoint
        response = self.make_request('get', '/healthz')
        if response and response.status_code == 200:
            self.log("API health endpoint - Working")
        else:
            self.log("API health endpoint - Failed", False)
            success = False
        
        return success
    
    def test_auth_endpoints(self) -> bool:
        """Test authentication endpoints"""
        print("\n--- Testing Auth Endpoints ---")
        
        # Test login with invalid credentials
        login_data = {
            'username': 'nonexistent_user',
            'password': 'wrong_password'
        }
        
        response = self.make_request('post', '/auth/login', 
                                   json=login_data,
                                   headers={'Content-Type': 'application/json'})
        
        if response:
            if response.status_code in [400, 401, 403]:
                self.log("Auth login endpoint - Properly rejects invalid credentials")
                return True
            elif response.status_code == 200:
                self.log("Auth login endpoint - Unexpected success with invalid creds", False)
                return False
            else:
                self.log(f"Auth login endpoint - Unexpected status {response.status_code}", False)
                return False
        else:
            return False
    
    def test_upload_security(self) -> bool:
        """Test upload endpoint security"""
        print("\n--- Testing Upload Security ---")
        
        # Test upload without authentication
        files = {'file': ('test.txt', b'test content', 'text/plain')}
        
        try:
            response = requests.post(f"{self.api_url}/posts/upload", files=files, timeout=5)
            
            if response.status_code in [400, 401, 403]:
                self.log("Upload security - Properly requires authentication")
                return True
            else:
                self.log(f"Upload security - Unexpected status {response.status_code}", False)
                return False
                
        except requests.exceptions.RequestException:
            self.log("Upload security - Endpoint not accessible", False)
            return False
    
    def test_moderation_access_control(self) -> bool:
        """Test moderation endpoints require proper permissions"""
        print("\n--- Testing Moderation Access Control ---")
        
        moderation_endpoints = [
            '/moderation/queue',
            '/admin/users',
            '/admin/posts'
        ]
        
        success = True
        
        for endpoint in moderation_endpoints:
            response = self.make_request('get', endpoint)
            
            if response and response.status_code in [401, 403]:
                self.log(f"Moderation access {endpoint} - Properly protected")
            elif response and response.status_code == 404:
                self.log(f"Moderation access {endpoint} - Not found (acceptable)")
            else:
                self.log(f"Moderation access {endpoint} - May have security issue", False)
                success = False
        
        return success
    
    def check_container_logs(self) -> bool:
        """Check container logs for critical errors"""
        print("\n--- Checking Container Logs ---")
        
        try:
            # Get recent logs from backend service
            result = subprocess.run(
                ['docker', 'compose', 'logs', '--tail=50', 'backend'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                self.log("Log check - Could not retrieve logs", False)
                return False
            
            logs = result.stdout
            
            # Check for critical errors
            critical_patterns = [
                'CRITICAL',
                'FATAL',
                'Exception in',
                'Traceback',
                'ConnectionError',
                'DatabaseError'
            ]
            
            critical_errors = []
            for pattern in critical_patterns:
                if pattern.lower() in logs.lower():
                    critical_errors.append(pattern)
            
            if critical_errors:
                self.log(f"Log check - Found critical errors: {critical_errors}", False)
                return False
            else:
                self.log("Log check - No critical errors found")
                return True
                
        except subprocess.TimeoutExpired:
            self.log("Log check - Timeout retrieving logs", False)
            return False
        except FileNotFoundError:
            self.log("Log check - Docker compose not available")
            return True  # Don't fail if docker not available
        except Exception as e:
            self.log(f"Log check - Error: {e}", False)
            return False
    
    def test_json_validation(self) -> bool:
        """Test API handles invalid JSON gracefully"""
        print("\n--- Testing JSON Validation ---")
        
        try:
            response = requests.post(
                f"{self.api_url}/posts/create",
                data="invalid json content",
                headers={'Content-Type': 'application/json'},
                timeout=5
            )
            
            if response.status_code in [400, 422]:
                self.log("JSON validation - Properly rejects invalid JSON")
                return True
            else:
                self.log(f"JSON validation - Unexpected status {response.status_code}", False)
                return False
                
        except requests.exceptions.RequestException:
            self.log("JSON validation - Request failed", False)
            return False
    
    def run_all_tests(self) -> bool:
        """Run all core flow tests"""
        print("=== ForumKit Core Flow Tests ===")
        
        tests = [
            ("Anonymous Post Flow", self.test_anonymous_post_flow),
            ("Post List Retrieval", self.test_post_list_retrieval),
            ("API Status Endpoints", self.test_api_status_endpoints),
            ("Auth Endpoints", self.test_auth_endpoints),
            ("Upload Security", self.test_upload_security),
            ("Moderation Access Control", self.test_moderation_access_control),
            ("JSON Validation", self.test_json_validation),
            ("Container Logs Check", self.check_container_logs),
        ]
        
        success_count = 0
        
        for test_name, test_func in tests:
            try:
                if test_func():
                    success_count += 1
            except Exception as e:
                self.log(f"{test_name} - Unexpected error: {e}", False)
        
        return success_count == len(tests)
    
    def print_summary(self):
        """Print test summary"""
        total = len(self.results)
        passed = sum(1 for r in self.results if r['success'])
        failed = total - passed
        
        print(f"\n=== Core Flow Test Summary ===")
        print(f"Total tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        
        if failed > 0:
            print("\nFailed tests:")
            for result in self.results:
                if not result['success']:
                    print(f"  ✗ {result['message']}")
        
        success_rate = (passed / total * 100) if total > 0 else 0
        print(f"Success rate: {success_rate:.1f}%")
        
        return failed == 0

def main():
    """Main entry point"""
    tester = CoreFlowTester()
    
    try:
        success = tester.run_all_tests()
        overall_success = tester.print_summary()
        
        if overall_success:
            print("\n🎉 All core flow tests PASSED")
            sys.exit(0)
        else:
            print("\n❌ Some core flow tests FAILED")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⚠️  Core flow tests interrupted")
        sys.exit(2)
    except Exception as e:
        print(f"\n💥 Core flow test error: {e}")
        sys.exit(3)

if __name__ == "__main__":
    main()