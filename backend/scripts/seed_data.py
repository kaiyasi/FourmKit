#!/usr/bin/env python3
"""
資料庫初始化腳本
建立測試學校和管理員帳戶
"""
from models import User, UserRole, School
from utils.db import init_engine_session
from utils.security import hash_password

def seed_data():
    print("=== ForumKit 資料庫初始化 ===")
    
    # 初始化資料庫
    print("1. 初始化資料庫連接...")
    init_engine_session()
    
    # 重新導入 db_session
    from utils.db import db_session
    
    # 建立測試學校
    print("2. 檢查/建立測試學校...")
    ncku = db_session.query(School).filter_by(slug="ncku").first()
    if not ncku:
        ncku = School(slug="ncku", name="國立成功大學")
        db_session.add(ncku)
        db_session.commit()
        print(f"   ✓ 建立學校: {ncku.name} (ID: {ncku.id})")
    else:
        print(f"   ✓ 學校已存在: {ncku.name} (ID: {ncku.id})")

    ntu = db_session.query(School).filter_by(slug="ntu").first()
    if not ntu:
        ntu = School(slug="ntu", name="國立台灣大學")
        db_session.add(ntu)
        db_session.commit()
        print(f"   ✓ 建立學校: {ntu.name} (ID: {ntu.id})")
    else:
        print(f"   ✓ 學校已存在: {ntu.name} (ID: {ntu.id})")
    
    # 建立管理員帳戶
    print("3. 檢查/建立管理員帳戶...")
    
    # 開發者管理員
    dev_admin = db_session.query(User).filter_by(username="dev_admin").first()
    if not dev_admin:
        dev_admin = User(
            username="dev_admin",
            email="dev@forumkit.local",
            password_hash=hash_password("admin123"),
            role=UserRole.dev_admin,
            school_id=None
        )
        db_session.add(dev_admin)
        print("   ✓ 建立開發者管理員: dev_admin")
    else:
        print("   ✓ 開發者管理員已存在: dev_admin")
    
    # 校內管理員
    campus_admin = db_session.query(User).filter_by(username="campus_admin").first()
    if not campus_admin:
        campus_admin = User(
            username="campus_admin",
            email="campus@forumkit.local",
            password_hash=hash_password("admin123"),
            role=UserRole.campus_admin,
            school_id=ncku.id
        )
        db_session.add(campus_admin)
        print("   ✓ 建立校內管理員: campus_admin")
    else:
        print("   ✓ 校內管理員已存在: campus_admin")
    
    # 跨校管理員
    cross_admin = db_session.query(User).filter_by(username="cross_admin").first()
    if not cross_admin:
        cross_admin = User(
            username="cross_admin",
            email="cross@forumkit.local",
            password_hash=hash_password("admin123"),
            role=UserRole.cross_admin,
            school_id=None
        )
        db_session.add(cross_admin)
        print("   ✓ 建立跨校管理員: cross_admin")
    else:
        print("   ✓ 跨校管理員已存在: cross_admin")
    
    # 一般測試用戶
    test_user = db_session.query(User).filter_by(username="testuser").first()
    if not test_user:
        test_user = User(
            username="testuser",
            email="test@forumkit.local",
            password_hash=hash_password("123456"),
            role=UserRole.user,
            school_id=ncku.id
        )
        db_session.add(test_user)
        print("   ✓ 建立測試用戶: testuser")
    else:
        print("   ✓ 測試用戶已存在: testuser")
    
    db_session.commit()
    print("   ✓ 資料庫更新完成")
    
    print("\n=== 預設帳號資訊 ===")
    print("開發者管理員: dev_admin / admin123")
    print("校內管理員: campus_admin / admin123")
    print("跨校管理員: cross_admin / admin123")
    print("測試用戶: testuser / 123456")
    print("\n=== 初始化完成 ===")

if __name__ == "__main__":
    seed_data()
