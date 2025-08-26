-- 為 comments 表添加 status 欄位
-- 執行時間：2025-08-24

-- 添加 status 欄位，預設值為 'pending'
ALTER TABLE comments ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'pending';

-- 為現有的留言設置狀態
-- 已刪除的留言設為 'rejected'，其他設為 'approved'
UPDATE comments SET status = 'rejected' WHERE is_deleted = true;
UPDATE comments SET status = 'approved' WHERE is_deleted = false;

-- 添加索引以提高查詢效能
CREATE INDEX idx_comments_status ON comments(status);
CREATE INDEX idx_comments_status_created ON comments(status, created_at);
