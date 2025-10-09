-- 添加 Media 模型的新欄位
ALTER TABLE media ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES users(id);
ALTER TABLE media ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE media ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE media ADD COLUMN IF NOT EXISTS file_type VARCHAR(32);
ALTER TABLE media ADD COLUMN IF NOT EXISTS mime_type VARCHAR(128);

-- 為現有記錄設置默認值
UPDATE media SET 
    file_name = 'unknown',
    file_size = 0,
    file_type = 'unknown',
    mime_type = 'application/octet-stream'
WHERE file_name IS NULL;

-- 為現有媒體設置 author_id（如果可能的話）
UPDATE media SET author_id = (
    SELECT p.author_id 
    FROM posts p 
    WHERE p.id = media.post_id
) WHERE media.author_id IS NULL;
