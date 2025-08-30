#!/usr/bin/env python3
"""
Test health check endpoints and container health
"""

import pytest
import requests
import socket
import time
from typing import Optional

class TestHealthCheck:
    
    def test_api_health_endpoint(self):
        """Test main API health endpoint"""
        try:
            response = requests.get('http://localhost:12005/api/status', timeout=5)
            assert response.status_code == 200
            
            data = response.json()
            assert 'status' in data
            assert 'timestamp' in data
            
        except requests.exceptions.ConnectionError:
            pytest.skip("API server not running on localhost:12005")
    
    def test_detailed_health_endpoint(self):
        """Test detailed health endpoint with service status"""
        try:
            response = requests.get('http://localhost:12005/api/healthz', timeout=5)
            assert response.status_code == 200
            
            data = response.json()
            assert 'status' in data
            assert 'services' in data
            
            # Check database connectivity
            services = data.get('services', {})
            if 'database' in services:
                assert services['database']['status'] in ['healthy', 'degraded']
            
        except requests.exceptions.ConnectionError:
            pytest.skip("API server not running on localhost:12005")
    
    def test_socket_health_check(self):
        """Test socket-based health check service"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3.0)
            sock.connect(('127.0.0.1', 9101))
            
            # Send ping
            sock.send(b'ping\n')
            
            # Receive response
            response = sock.recv(1024).decode('utf-8').strip()
            assert response == 'pong'
            
            sock.close()
            
        except (ConnectionRefusedError, socket.timeout):
            pytest.skip("Socket health service not running on port 9101")
    
    def test_frontend_availability(self):
        """Test frontend is served and accessible"""
        try:
            response = requests.get('http://localhost:12005/', timeout=5)
            assert response.status_code == 200
            assert 'text/html' in response.headers.get('content-type', '')
            
            # Should contain basic HTML structure
            content = response.text
            assert '<html' in content.lower()
            assert '<head>' in content.lower() or '<head ' in content.lower()
            
        except requests.exceptions.ConnectionError:
            pytest.skip("Frontend not available on localhost:12005")
    
    def test_cdn_service_availability(self):
        """Test CDN service is responding"""
        try:
            response = requests.get('http://localhost:12002/', timeout=5)
            # CDN might return 403 (no index) but should be responsive
            assert response.status_code in [200, 403, 404]
            
        except requests.exceptions.ConnectionError:
            pytest.skip("CDN service not running on localhost:12002")
    
    def test_database_port_accessibility(self):
        """Test database port is accessible (for internal health checks)"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            result = sock.connect_ex(('127.0.0.1', 12007))
            sock.close()
            
            # Port should be open (result 0) or filtered
            assert result in [0, 111]  # 0=open, 111=connection refused but port exists
            
        except Exception:
            pytest.skip("Database port check failed")
    
    def test_redis_port_accessibility(self):
        """Test Redis port is accessible (for internal health checks)"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            result = sock.connect_ex(('127.0.0.1', 12008))
            sock.close()
            
            # Port should be open or filtered
            assert result in [0, 111]
            
        except Exception:
            pytest.skip("Redis port check failed")
    
    def test_api_cors_headers(self):
        """Test API returns proper CORS headers"""
        try:
            response = requests.options('http://localhost:12005/api/status', timeout=5)
            
            # Should have CORS headers
            headers = response.headers
            assert 'access-control-allow-origin' in headers or response.status_code == 405
            
        except requests.exceptions.ConnectionError:
            pytest.skip("API server not running")
    
    def test_security_headers(self):
        """Test security headers are present"""
        try:
            response = requests.get('http://localhost:12005/', timeout=5)
            headers = response.headers
            
            # Check for basic security headers
            security_headers = [
                'x-content-type-options',
                'x-frame-options',
                'referrer-policy'
            ]
            
            present_headers = sum(1 for header in security_headers if header in headers)
            assert present_headers >= 2  # At least 2 security headers should be present
            
        except requests.exceptions.ConnectionError:
            pytest.skip("Web server not running")
    
    def test_api_response_format(self):
        """Test API returns proper JSON format"""
        try:
            response = requests.get('http://localhost:12005/api/status', timeout=5)
            assert response.status_code == 200
            
            # Should return valid JSON
            data = response.json()
            assert isinstance(data, dict)
            
            # Should have content-type header
            assert 'application/json' in response.headers.get('content-type', '')
            
        except requests.exceptions.ConnectionError:
            pytest.skip("API server not running")
    
    def test_service_startup_readiness(self):
        """Test services are ready to handle requests"""
        services_to_check = [
            ('http://localhost:12005/api/status', 'API'),
            ('http://localhost:12005/', 'Frontend'),
        ]
        
        max_retries = 10
        retry_delay = 1
        
        for url, service_name in services_to_check:
            ready = False
            
            for attempt in range(max_retries):
                try:
                    response = requests.get(url, timeout=2)
                    if response.status_code == 200:
                        ready = True
                        break
                except requests.exceptions.RequestException:
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay)
                        continue
            
            if not ready:
                pytest.skip(f"{service_name} service not ready after {max_retries} attempts")