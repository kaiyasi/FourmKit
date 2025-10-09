#!/usr/bin/env python3
"""
Discord Bot 啟動腳本 - 現代化斜線指令版本
"""

import sys
import os
from pathlib import Path

# 添加父目錄到路徑
sys.path.append(str(Path(__file__).parent.parent))

# 直接使用現代化的 Bot
from modern_bot import main

if __name__ == "__main__":
    try:
        import asyncio
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Bot 已停止")