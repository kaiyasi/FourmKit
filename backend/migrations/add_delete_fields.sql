-- 添加刪文相關欄位到 posts 表
ALTER TABLE posts 
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN deleted_by INTEGER REFERENCES users(id),
ADD COLUMN delete_reason TEXT,
ADD COLUMN delete_request_count INTEGER DEFAULT 0 NOT NULL;

-- 添加刪文相關欄位到 delete_requests 表
ALTER TABLE delete_requests 
ADD COLUMN requester_ip VARCHAR(64),
ADD COLUMN requester_user_agent VARCHAR(255),
ADD COLUMN status VARCHAR(16) DEFAULT 'pending' NOT NULL,
ADD COLUMN reviewed_by INTEGER REFERENCES users(id),
ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN review_note TEXT;

-- 添加軟刪除欄位到 media 表
ALTER TABLE media 
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN deleted_by INTEGER REFERENCES users(id);

-- 添加軟刪除欄位到 comments 表（如果還沒有的話）
-- 注意：comments 表可能已經有 is_deleted 欄位
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'comments' AND column_name = 'deleted_at') THEN
        ALTER TABLE comments ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'comments' AND column_name = 'deleted_by') THEN
        ALTER TABLE comments ADD COLUMN deleted_by INTEGER REFERENCES users(id);
    END IF;
END $$;

-- 創建索引以提高查詢性能
CREATE INDEX IF NOT EXISTS idx_posts_is_deleted ON posts(is_deleted);
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON delete_requests(status);
CREATE INDEX IF NOT EXISTS idx_delete_requests_reviewed_at ON delete_requests(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_media_is_deleted ON media(is_deleted);
CREATE INDEX IF NOT EXISTS idx_comments_is_deleted ON comments(is_deleted);

-- 更新現有數據
-- 將所有 status = 'deleted' 的貼文標記為 is_deleted = true
UPDATE posts 
SET is_deleted = true, 
    deleted_at = created_at,
    delete_reason = '系統遷移'
WHERE status = 'deleted';

-- 將所有 status = 'deleted' 的貼文狀態改回 'approved'（因為我們現在用 is_deleted 來標記）
UPDATE posts 
SET status = 'approved'
WHERE status = 'deleted';
