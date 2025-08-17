-- 修復 posts 表的 updated_at 欄位
-- 順序很重要：先加欄位，再設 DEFAULT，再補值，最後設 NOT NULL

-- 1) 檢查並新增 updated_at 欄位（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'posts' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE posts ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 2) 設定 DEFAULT
ALTER TABLE posts ALTER COLUMN updated_at SET DEFAULT now();

-- 3) 把既有 NULL 值補上（使用 created_at 或 now()）
UPDATE posts 
SET updated_at = COALESCE(created_at, now()) 
WHERE updated_at IS NULL;

-- 4) 設定 NOT NULL
ALTER TABLE posts ALTER COLUMN updated_at SET NOT NULL;

-- 5) 加 UPDATE trigger，任何更新都自動刷新 updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6) 建立 trigger（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_posts_updated_at'
  ) THEN
    CREATE TRIGGER trg_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 7) 驗證結果
\d+ posts;
