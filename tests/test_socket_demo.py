#!/usr/bin/env python3
"""
Test cases for socket demo functionality
Tests normal/error paths: half-packets, invalid payload, timeout
"""

import pytest
import threading
import time
import socket
import json
from typing import Optional
from tools.socket_demo.server import SocketServer
from tools.socket_demo.client import SocketClient

class TestSocketDemo:
    
    def setup_method(self):
        """Setup test server on unique port"""
        self.port = 19999  # Test port
        self.server = SocketServer('127.0.0.1', self.port)
        self.server_thread = None
    
    def teardown_method(self):
        """Cleanup server"""
        if self.server:
            self.server.stop()
        if self.server_thread and self.server_thread.is_alive():
            self.server_thread.join(timeout=1)
    
    def start_test_server(self):
        """Start server in background thread"""
        self.server_thread = threading.Thread(target=self.server.start, daemon=True)
        self.server_thread.start()
        time.sleep(0.1)  # Let server start
    
    def test_server_start_stop(self):
        """Test server can start and stop cleanly"""
        assert not self.server.running
        
        # Start server in thread
        self.start_test_server()
        time.sleep(0.1)
        assert self.server.running
        
        # Stop server
        self.server.stop()
        time.sleep(0.1)
        assert not self.server.running
    
    def test_simple_echo(self):
        """Test simple text echo functionality"""
        self.start_test_server()
        
        client = SocketClient('127.0.0.1', self.port, timeout=2.0)
        assert client.connect()
        
        response = client.send_message("Hello World")
        assert response is not None
        assert response["type"] == "echo"
        assert response["original"] == "Hello World"
        
        client.disconnect()
    
    def test_json_ping_pong(self):
        """Test JSON ping/pong functionality"""
        self.start_test_server()
        
        client = SocketClient('127.0.0.1', self.port, timeout=2.0)
        assert client.connect()
        
        response = client.send_json({"type": "ping"})
        assert response is not None
        assert response["type"] == "pong"
        assert "timestamp" in response
        
        client.disconnect()
    
    def test_json_echo_with_data(self):
        """Test JSON echo with payload data"""
        self.start_test_server()
        
        client = SocketClient('127.0.0.1', self.port, timeout=2.0)
        assert client.connect()
        
        test_data = "test payload data"
        response = client.send_json({"type": "echo", "data": test_data})
        assert response is not None
        assert response["type"] == "echo_response"
        assert response["data"] == test_data
        
        client.disconnect()
    
    def test_large_payload(self):
        """Test handling of large JSON payload"""
        self.start_test_server()
        
        client = SocketClient('127.0.0.1', self.port, timeout=2.0)
        assert client.connect()
        
        large_payload = {"data": "x" * 1000, "numbers": list(range(50))}
        response = client.send_json({"type": "test_payload", "payload": large_payload})
        assert response is not None
        assert response["type"] == "test_response"
        assert response["processed"] is True
        assert response["payload_size"] > 1000
        
        client.disconnect()
    
    def test_invalid_json_fallback(self):
        """Test server handles invalid JSON gracefully"""
        self.start_test_server()
        
        client = SocketClient('127.0.0.1', self.port, timeout=2.0)
        assert client.connect()
        
        # Send invalid JSON - should fallback to text echo
        response = client.send_message("{invalid_json:")
        assert response is not None
        assert response["type"] == "echo"
        assert response["original"] == "{invalid_json:"
        
        client.disconnect()
    
    def test_unknown_json_type(self):
        """Test server handles unknown JSON message types"""
        self.start_test_server()
        
        client = SocketClient('127.0.0.1', self.port, timeout=2.0)
        assert client.connect()
        
        response = client.send_json({"type": "unknown_message_type", "data": "test"})
        assert response is not None
        assert response["type"] == "unknown_type"
        assert response["received_type"] == "unknown_message_type"
        
        client.disconnect()
    
    def test_connection_timeout(self):
        """Test client timeout handling"""
        # Don't start server - connection should fail
        client = SocketClient('127.0.0.1', self.port, timeout=1.0)
        assert not client.connect()
    
    def test_half_packet_handling(self):
        """Test server handles partial/incomplete data"""
        self.start_test_server()
        
        # Connect manually to send partial data
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2.0)
        
        try:
            sock.connect(('127.0.0.1', self.port))
            
            # Send incomplete JSON
            incomplete_json = '{"type":"ping","da'
            sock.send(incomplete_json.encode('utf-8'))
            
            # Wait a bit then send rest
            time.sleep(0.1)
            sock.send('ta":"test"}'.encode('utf-8'))
            
            # Should get response for complete message
            response = sock.recv(1024).decode('utf-8')
            data = json.loads(response.strip())
            
            # Should fallback to echo since JSON was malformed when first processed
            assert data["type"] == "echo"
            
        finally:
            sock.close()
    
    def test_multiple_clients(self):
        """Test server handles multiple concurrent clients"""
        self.start_test_server()
        
        def client_task(client_id):
            client = SocketClient('127.0.0.1', self.port, timeout=2.0)
            if client.connect():
                response = client.send_json({"type": "ping", "client": client_id})
                client.disconnect()
                return response is not None and response.get("type") == "pong"
            return False
        
        # Start multiple clients concurrently
        threads = []
        results = []
        
        for i in range(3):
            thread = threading.Thread(
                target=lambda i=i: results.append(client_task(i))
            )
            threads.append(thread)
            thread.start()
        
        # Wait for all clients
        for thread in threads:
            thread.join(timeout=3)
        
        # All clients should succeed
        assert len(results) == 3
        assert all(results)
    
    def test_client_stress_test(self):
        """Test client stress test functionality"""
        self.start_test_server()
        
        client = SocketClient('127.0.0.1', self.port, timeout=5.0)
        result = client.run_stress_test(10)
        
        assert result["passed"] is True
        assert result["successful"] == 10
        assert result["failed"] == 0
        assert result["duration"] > 0
    
    def test_client_test_suite(self):
        """Test client's built-in test suite"""
        self.start_test_server()
        
        client = SocketClient('127.0.0.1', self.port, timeout=5.0)
        results = client.run_tests()
        
        # Should have multiple test results
        assert len(results) >= 4
        
        # Most tests should pass
        passed = sum(1 for r in results if r.get("passed", False))
        assert passed >= 4