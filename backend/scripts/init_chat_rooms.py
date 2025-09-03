#!/usr/bin/env python3
"""
初始化聊天房間腳本
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db import get_session
from services.chat_service import ChatService


def init_default_rooms():
    """初始化預設聊天房間"""
    print("開始初始化聊天房間...")
    
    with get_session() as s:
        # 檢查是否已有房間
        existing_rooms = ChatService.get_active_rooms(s)
        if existing_rooms:
            print(f"發現 {len(existing_rooms)} 個現有房間，跳過初始化")
            return
        
        # 創建預設房間
        default_rooms = [
            {
                "room_id": "admin",
                "name": "管理員聊天室",
                "description": "系統管理員專用聊天室",
                "room_type": "system"
            },
            {
                "room_id": "lobby",
                "name": "大廳",
                "description": "一般用戶聊天大廳",
                "room_type": "system"
            },
            {
                "room_id": "dev",
                "name": "開發討論",
                "description": "開發相關討論",
                "room_type": "system"
            }
        ]
        
        for room_data in default_rooms:
            try:
                room = ChatService.create_room(
                    session=s,
                    room_id=room_data["room_id"],
                    name=room_data["name"],
                    description=room_data["description"],
                    room_type=room_data["room_type"]
                )
                print(f"✓ 創建房間: {room.name} ({room.id})")
            except Exception as e:
                print(f"✗ 創建房間失敗 {room_data['room_id']}: {e}")
        
        s.commit()
        print("聊天房間初始化完成！")


if __name__ == "__main__":
    init_default_rooms()
