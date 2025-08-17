#!/usr/bin/env python3
"""
重複廣播檢測測試 - 專門抓「無限城」
用法：
  pip install pytest python-socketio requests
  python test_duplicate_broadcast.py
"""

import asyncio
import aiohttp
import socketio
import json
import time
import uuid
from datetime import datetime
from typing import Set, List, Dict

class DuplicateBroadcastDetector:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.client_id = str(uuid.uuid4())
        self.seen_broadcasts: Set[str] = set()
        self.received_events: List[Dict] = []
        self.sio = None
        
    async def setup_socket(self):
        """設置 Socket.IO 客戶端"""
        self.sio = socketio.AsyncClient()
        
        @self.sio.event
        async def connect():
            print(f"✅ Socket connected: {self.sio.sid}")
        
        @self.sio.event
        async def disconnect():
            print(f"❌ Socket disconnected")
        
        @self.sio.event
        async def post_created(data):
            timestamp = datetime.now().isoformat()
            post_id = data.get('post', {}).get('id', 'unknown')
            origin = data.get('origin', 'unknown')
            tx_id = data.get('client_tx_id', 'none')
            
            event_signature = f"{post_id}_{origin}_{tx_id}"
            
            print(f"📡 Received post_created: id={post_id} origin={origin} tx_id={tx_id} at {timestamp}")
            
            if event_signature in self.seen_broadcasts:
                print(f"🚨 DUPLICATE BROADCAST DETECTED! Signature: {event_signature}")
                print(f"   Previous events with same signature:")
                for i, event in enumerate(self.received_events):
                    if f"{event.get('post', {}).get('id')}_{event.get('origin')}_{event.get('client_tx_id')}" == event_signature:
                        print(f"   [{i}] {event.get('timestamp')}")
            
            self.seen_broadcasts.add(event_signature)
            self.received_events.append({
                'timestamp': timestamp,
                'post_id': post_id,
                'origin': origin,
                'client_tx_id': tx_id,
                'full_data': data
            })
        
        await self.sio.connect(f"{self.base_url}", socketio_path="/socket.io")
        
    async def create_post(self, content: str) -> Dict:
        """創建貼文並返回結果"""
        tx_id = str(uuid.uuid4())
        
        async with aiohttp.ClientSession() as session:
            headers = {
                'Content-Type': 'application/json',
                'X-Client-Id': self.client_id,
                'X-Tx-Id': tx_id
            }
            
            payload = {
                'content': content,
                'client_tx_id': tx_id
            }
            
            print(f"📤 Creating post: tx_id={tx_id} content='{content[:30]}...'")
            
            async with session.post(
                f"{self.base_url}/api/posts",
                json=payload,
                headers=headers
            ) as resp:
                if resp.status == 201:
                    result = await resp.json()
                    post_data = result.get('data', {})
                    print(f"✅ Post created: id={post_data.get('id')} tx_id={tx_id}")
                    return post_data
                else:
                    error_text = await resp.text()
                    print(f"❌ Post creation failed: {resp.status} - {error_text}")
                    raise Exception(f"Failed to create post: {resp.status}")
    
    async def test_single_post_no_duplicates(self):
        """測試單篇發文不會產生重複廣播"""
        print("\n" + "="*60)
        print("🧪 Test 1: Single post - no duplicate broadcasts")
        print("="*60)
        
        initial_count = len(self.received_events)
        
        # 創建一篇貼文
        content = f"Test post {datetime.now().isoformat()}"
        post = await self.create_post(content)
        
        # 等待廣播
        await asyncio.sleep(3)
        
        # 檢查結果
        new_events = [e for e in self.received_events[initial_count:] if e['post_id'] == post.get('id')]
        
        if len(new_events) == 1:
            print(f"✅ Received exactly 1 broadcast for post {post.get('id')}")
            return True
        elif len(new_events) == 0:
            print(f"⚠️  No broadcast received for post {post.get('id')}")
            return False
        else:
            print(f"🚨 DUPLICATE DETECTED: Received {len(new_events)} broadcasts for post {post.get('id')}")
            for i, event in enumerate(new_events):
                print(f"   [{i+1}] {event['timestamp']} origin={event['origin']} tx_id={event['client_tx_id']}")
            return False
    
    async def test_rapid_posts_no_duplicates(self):
        """測試快速連續發文不會產生重複廣播"""
        print("\n" + "="*60)
        print("🧪 Test 2: Rapid posts - no duplicate broadcasts")
        print("="*60)
        
        initial_count = len(self.received_events)
        post_count = 3
        posts = []
        
        # 快速創建多篇貼文
        for i in range(post_count):
            content = f"Rapid test post {i+1} at {datetime.now().isoformat()}"
            try:
                post = await self.create_post(content)
                posts.append(post)
            except Exception as e:
                print(f"❌ Failed to create post {i+1}: {e}")
        
        # 等待所有廣播
        await asyncio.sleep(5)
        
        # 檢查每篇貼文的廣播數量
        success = True
        for post in posts:
            post_id = post.get('id')
            post_events = [e for e in self.received_events[initial_count:] if e['post_id'] == post_id]
            
            if len(post_events) == 1:
                print(f"✅ Post {post_id}: exactly 1 broadcast")
            else:
                print(f"🚨 Post {post_id}: {len(post_events)} broadcasts (expected 1)")
                success = False
        
        return success
    
    async def test_multi_client_simulation(self):
        """模擬多客戶端環境，檢查廣播隔離"""
        print("\n" + "="*60)
        print("🧪 Test 3: Multi-client simulation")
        print("="*60)
        
        # 創建第二個客戶端
        other_client_id = str(uuid.uuid4())
        initial_count = len(self.received_events)
        
        # 用不同客戶端ID發文
        tx_id = str(uuid.uuid4())
        
        async with aiohttp.ClientSession() as session:
            headers = {
                'Content-Type': 'application/json',
                'X-Client-Id': other_client_id,  # 不同的客戶端ID
                'X-Tx-Id': tx_id
            }
            
            payload = {
                'content': f"Multi-client test at {datetime.now().isoformat()}",
                'client_tx_id': tx_id
            }
            
            async with session.post(
                f"{self.base_url}/api/posts",
                json=payload,
                headers=headers
            ) as resp:
                if resp.status == 201:
                    result = await resp.json()
                    post_data = result.get('data', {})
                    print(f"✅ Other client post created: id={post_data.get('id')}")
                    
                    await asyncio.sleep(3)
                    
                    # 檢查我們是否收到了其他客戶端的廣播
                    new_events = [e for e in self.received_events[initial_count:] if e['post_id'] == post_data.get('id')]
                    
                    if len(new_events) == 1 and new_events[0]['origin'] == other_client_id:
                        print(f"✅ Correctly received other client's broadcast")
                        return True
                    else:
                        print(f"❌ Broadcast isolation issue: {len(new_events)} events")
                        return False
        
        return False
    
    async def run_all_tests(self):
        """運行所有測試"""
        print("🚀 Starting duplicate broadcast detection tests")
        print(f"🔗 Target: {self.base_url}")
        print(f"👤 Client ID: {self.client_id}")
        
        try:
            await self.setup_socket()
            await asyncio.sleep(2)  # 等待連線穩定
            
            results = []
            
            # 運行測試
            results.append(await self.test_single_post_no_duplicates())
            results.append(await self.test_rapid_posts_no_duplicates())
            results.append(await self.test_multi_client_simulation())
            
            # 總結
            print("\n" + "="*60)
            print("📊 TEST RESULTS SUMMARY")
            print("="*60)
            
            passed = sum(results)
            total = len(results)
            
            print(f"✅ Passed: {passed}/{total}")
            print(f"❌ Failed: {total - passed}/{total}")
            print(f"📡 Total events received: {len(self.received_events)}")
            print(f"🔍 Unique signatures: {len(self.seen_broadcasts)}")
            
            if passed == total:
                print("\n🎉 ALL TESTS PASSED - No duplicate broadcasts detected!")
            else:
                print("\n⚠️  SOME TESTS FAILED - Duplicate broadcast issue exists!")
                
                # 顯示詳細的事件記錄
                print("\n📋 All received events:")
                for i, event in enumerate(self.received_events):
                    print(f"  [{i+1}] {event['timestamp']} id={event['post_id']} origin={event['origin']} tx_id={event['client_tx_id']}")
            
        except Exception as e:
            print(f"❌ Test execution failed: {e}")
        finally:
            if self.sio:
                await self.sio.disconnect()

async def main():
    detector = DuplicateBroadcastDetector()
    await detector.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())
