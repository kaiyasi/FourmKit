#!/usr/bin/env python3
"""初始化上傳目錄結構"""

import os

def init_upload_dirs():
    """創建必要的上傳目錄結構"""
    root = os.getenv("UPLOAD_ROOT", "uploads")
    
    # 基本目錄結構
    dirs = [
        os.path.join(root, "pending"),
        os.path.join(root, "public"),
        os.path.join(root, "public", "schools"),
        os.path.join(root, "pages"),
    ]
    
    print("創建上傳目錄結構...")
    for dir_path in dirs:
        try:
            os.makedirs(dir_path, exist_ok=True)
            print(f"✓ {dir_path}")
        except Exception as e:
            print(f"✗ {dir_path}: {e}")
    
    # 為現有學校創建目錄
    try:
        import sys
        sys.path.append('/app')
        from models import School
        from utils.db import get_session
        
        session = get_session()
        if session is None:
            raise Exception("無法獲取數據庫會話")
            
        with session as s:
            schools = s.query(School).all()
            for school in schools:
                school_dir = os.path.join(root, "public", "schools", str(school.id))
                try:
                    os.makedirs(school_dir, exist_ok=True)
                    print(f"✓ 學校目錄: {school_dir} ({school.name})")
                except Exception as e:
                    print(f"✗ 學校目錄 {school_dir}: {e}")
    except Exception as e:
        print(f"無法創建學校目錄: {e}")
        print("將手動創建常見的學校目錄...")
        # 手動創建常見的學校目錄
        common_schools = [1, 2, 3, 4, 5]
        for school_id in common_schools:
            school_dir = os.path.join(root, "public", "schools", str(school_id))
            try:
                os.makedirs(school_dir, exist_ok=True)
                print(f"✓ 預設學校目錄: {school_dir}")
            except Exception as e:
                print(f"✗ 預設學校目錄 {school_dir}: {e}")
    
    print("目錄初始化完成！")

if __name__ == "__main__":
    init_upload_dirs()
