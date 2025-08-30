#!/usr/bin/env python3
"""
完整資料匯出腳本
用於在重建網站前備份所有重要資料
"""

import os
import sys
import json
import csv
import shutil
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from pathlib import Path

def export_full_data():
    """匯出完整資料"""
    
    # 嘗試不同的數據庫 URL
    db_urls = [
        os.getenv('DATABASE_URL'),
        "postgresql+psycopg2://forumkit:forumkit@127.0.0.1:12007/forumkit",
        "postgresql+psycopg2://forumkit:forumkit@localhost:12007/forumkit",
        "postgresql+psycopg2://forumkit:forumkit@postgres:80/forumkit"
    ]
    
    engine = None
    for url in db_urls:
        if not url:
            continue
        try:
            print(f"🔧 嘗試連接數據庫: {url}")
            engine = create_engine(url)
            # 測試連接
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"✅ 成功連接到數據庫: {url}")
            break
        except Exception as e:
            print(f"❌ 連接失敗: {e}")
            continue
    
    if not engine:
        print("❌ 無法連接到任何數據庫")
        print("💡 請確保 Docker 容器正在運行：docker-compose up -d")
        return
    
    # 創建匯出目錄
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    export_dir = Path(f"exports/full_backup_{timestamp}")
    export_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        with engine.connect() as conn:
            print("🔧 開始完整資料匯出...")
            
            # 1. 匯出所有表結構
            print("📋 匯出資料庫結構...")
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            """))
            
            tables = [row[0] for row in result]
            print(f"📊 發現 {len(tables)} 個資料表")
            
            # 2. 匯出每個表的資料
            for table in tables:
                print(f"📋 匯出 {table} 資料...")
                try:
                    # 獲取表結構
                    result = conn.execute(text(f"""
                        SELECT column_name, data_type, is_nullable
                        FROM information_schema.columns 
                        WHERE table_name = '{table}' 
                        AND table_schema = 'public'
                        ORDER BY ordinal_position
                    """))
                    
                    columns = [row[0] for row in result]
                    
                    # 匯出資料
                    result = conn.execute(text(f"SELECT * FROM {table} ORDER BY id"))
                    
                    table_data = []
                    for row in result:
                        row_dict = {}
                        for i, value in enumerate(row):
                            if hasattr(value, 'isoformat'):  # 處理日期時間
                                row_dict[columns[i]] = value.isoformat()
                            else:
                                row_dict[columns[i]] = value
                        table_data.append(row_dict)
                    
                    # 保存為 JSON
                    table_file = export_dir / f"{table}.json"
                    with open(table_file, 'w', encoding='utf-8') as f:
                        json.dump(table_data, f, ensure_ascii=False, indent=2)
                    
                    print(f"   ✅ {table}: {len(table_data)} 筆記錄")
                    
                except Exception as e:
                    print(f"   ❌ {table}: 匯出失敗 - {e}")
            
            # 3. 備份上傳檔案
            print("📁 備份上傳檔案...")
            uploads_dir = Path("uploads")
            if uploads_dir.exists():
                backup_uploads_dir = export_dir / "uploads_backup"
                shutil.copytree(uploads_dir, backup_uploads_dir)
                print(f"✅ 上傳檔案已備份到: {backup_uploads_dir}")
            else:
                print("ℹ️ uploads 目錄不存在，跳過檔案備份")
            
            # 4. 備份環境設定
            print("⚙️ 備份環境設定...")
            env_files = [
                "backend/env.example",
                "backend/config/config.json",
                "docker-compose.yml",
                ".env"
            ]
            
            for env_file in env_files:
                if Path(env_file).exists():
                    backup_env_file = export_dir / f"config_{Path(env_file).name}"
                    shutil.copy2(env_file, backup_env_file)
                    print(f"✅ {env_file} 已備份")
            
            # 5. 生成統計報告
            print("📊 生成詳細統計報告...")
            stats = {
                'export_timestamp': datetime.now(timezone.utc).isoformat(),
                'database_tables': len(tables),
                'table_records': {}
            }
            
            for table in tables:
                try:
                    result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = result.fetchone()[0]
                    stats['table_records'][table] = count
                except:
                    stats['table_records'][table] = 'error'
            
            stats_file = export_dir / "statistics.json"
            with open(stats_file, 'w', encoding='utf-8') as f:
                json.dump(stats, f, ensure_ascii=False, indent=2)
            
            # 6. 生成重建指南
            print("📝 生成重建指南...")
            rebuild_guide = f"""# ForumKit 重建指南

## 匯出資訊
- 匯出時間: {datetime.now(timezone.utc).isoformat()}
- 資料庫表數量: {len(tables)}
- 總記錄數: {sum(stats['table_records'].values()) if isinstance(sum(stats['table_records'].values()), int) else 'N/A'}

## 重建步驟

### 1. 環境準備
```bash
# 克隆專案
git clone <your-repo>
cd ForumKit

# 安裝依賴
pip install -r backend/requirements.txt
npm install --prefix frontend
```

### 2. 資料庫重建
```bash
# 啟動資料庫
docker-compose up -d postgres

# 執行遷移
cd backend
alembic upgrade head

# 匯入資料（可選）
# 使用匯出的 JSON 檔案重新建立資料
```

### 3. 環境變數設定
- 複製 `config_env.example` 到 `.env`
- 設定必要的環境變數
- 確保 JWT_SECRET_KEY 與原系統相同

### 4. 檔案恢復
- 將 `uploads_backup` 目錄內容複製到 `uploads`
- 確保檔案權限正確

### 5. 啟動服務
```bash
# 開發模式
docker-compose up

# 或分別啟動
cd backend && python app.py
cd frontend && npm run dev
```

## 注意事項
- 密碼雜湊已包含在匯出中，使用者可以保持原密碼
- 建議在重建前測試匯出資料的完整性
- 重建後檢查所有功能是否正常運作

## 匯出檔案清單
"""
            
            for table in tables:
                rebuild_guide += f"- {table}.json\n"
            
            rebuild_guide += """
## 聯絡資訊
如有問題，請聯繫系統管理員。
"""
            
            guide_file = export_dir / "REBUILD_GUIDE.md"
            with open(guide_file, 'w', encoding='utf-8') as f:
                f.write(rebuild_guide)
            
            print("✅ 重建指南已生成")
            
            # 7. 生成匯出摘要
            summary = {
                'export_timestamp': datetime.now(timezone.utc).isoformat(),
                'export_directory': str(export_dir),
                'database_tables': tables,
                'table_records': stats['table_records'],
                'files_backed_up': [
                    str(f) for f in export_dir.glob("*.json")
                ],
                'notes': [
                    "此為完整資料備份，包含所有資料庫記錄",
                    "上傳檔案已包含在備份中",
                    "環境設定檔案已備份",
                    "重建時請參考 REBUILD_GUIDE.md"
                ]
            }
            
            summary_file = export_dir / "export_summary.json"
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, ensure_ascii=False, indent=2)
            
            print("\n🎉 完整資料匯出完成！")
            print(f"📁 備份目錄: {export_dir}")
            print(f"📊 資料表數量: {len(tables)}")
            print(f"📄 匯出檔案:")
            for table in tables:
                count = stats['table_records'].get(table, 0)
                print(f"   - {table}: {count} 筆記錄")
            
            print("\n💡 重建建議:")
            print("   1. 備份整個 exports 目錄到安全位置")
            print("   2. 記錄當前的環境變數和設定")
            print("   3. 測試匯出資料的完整性")
            print("   4. 重建時參考 REBUILD_GUIDE.md")
            print("   5. 重建後驗證所有功能")
            
    except Exception as e:
        print(f"❌ 匯出失敗: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    export_full_data()
