#!/usr/bin/env python3
"""
手動遷移腳本 - 添加統一模板欄位
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.db import get_session
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_manual_migration():
    """手動運行遷移"""
    try:
        with get_session() as db:
            # 檢查並添加 use_unified_templates 欄位
            try:
                result = db.execute(text("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'ig_accounts' AND column_name = 'use_unified_templates'
                """))
                
                if not result.fetchone():
                    logger.info("添加 use_unified_templates 欄位...")
                    db.execute(text("""
                        ALTER TABLE ig_accounts 
                        ADD COLUMN use_unified_templates BOOLEAN NOT NULL DEFAULT FALSE
                    """))
                    logger.info("✓ use_unified_templates 欄位已添加")
                else:
                    logger.info("✓ use_unified_templates 欄位已存在")
                
            except Exception as e:
                logger.warning(f"添加 use_unified_templates 欄位時出錯: {e}")
            
            # 檢查並添加 default_unified_template_id 欄位
            try:
                result = db.execute(text("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = 'ig_accounts' AND column_name = 'default_unified_template_id'
                """))
                
                if not result.fetchone():
                    logger.info("添加 default_unified_template_id 欄位...")
                    db.execute(text("""
                        ALTER TABLE ig_accounts 
                        ADD COLUMN default_unified_template_id INTEGER
                    """))
                    logger.info("✓ default_unified_template_id 欄位已添加")
                else:
                    logger.info("✓ default_unified_template_id 欄位已存在")
                    
            except Exception as e:
                logger.warning(f"添加 default_unified_template_id 欄位時出錯: {e}")
            
            # 檢查是否需要創建統一模板表（暫時跳過，避免複雜性）
            try:
                result = db.execute(text("""
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_name = 'ig_unified_templates'
                """))
                
                if not result.fetchone():
                    logger.info("統一模板表將在後續版本中創建")
                else:
                    logger.info("✓ 統一模板表已存在")
                    
            except Exception as e:
                logger.warning(f"檢查統一模板表時出錯: {e}")
            
            db.commit()
            logger.info("手動遷移完成！")
            
    except Exception as e:
        logger.error(f"遷移失敗: {e}")
        return False
    
    return True

if __name__ == "__main__":
    success = run_manual_migration()
    if success:
        print("遷移成功完成!")
    else:
        print("遷移失敗!")
        sys.exit(1)
