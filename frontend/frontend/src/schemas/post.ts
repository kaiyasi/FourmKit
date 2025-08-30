// 暫時使用簡單的類型檢查，稍後可以替換為 zod
export interface Post {
  id: number;
  content: string;
  author_hash?: string;
  created_at?: string;
  media_count?: number;
  comment_count?: number;
  cover_path?: string | null;
  // 用於對應樂觀更新的暫時貼文（非後端主鍵）
  client_tx_id?: string;
  // 學校資訊（改為顯示學校名稱用）
  school_id?: number | null;
  school?: { id: number; slug: string; name: string } | null;
}

export interface PostList {
  items: Post[];
  page: number;
  per_page: number;
  total: number;
}

// 簡單的運行時類型檢查
export function validatePost(obj: any): Post {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Post must be an object');
  }
  
  if (typeof obj.id !== 'number') {
    throw new Error('Post.id must be a number');
  }
  
  if (typeof obj.content !== 'string') {
    throw new Error('Post.content must be a string');
  }
  
  return {
    id: obj.id,
    content: obj.content,
    author_hash: typeof obj.author_hash === 'string' ? obj.author_hash : undefined,
    created_at: typeof obj.created_at === 'string' ? obj.created_at : undefined,
    media_count: typeof obj.media_count === 'number' ? obj.media_count : undefined,
    comment_count: typeof obj.comment_count === 'number' ? obj.comment_count : undefined,
    cover_path: typeof obj.cover_path === 'string' ? obj.cover_path : (obj.cover_path === null ? null : undefined),
    client_tx_id: typeof obj.client_tx_id === 'string' ? obj.client_tx_id : undefined,
    school_id: typeof obj.school_id === 'number' ? obj.school_id : (obj.school_id === null ? null : undefined),
    school: (obj.school && typeof obj.school === 'object' && typeof obj.school.id === 'number')
      ? { id: obj.school.id, slug: String(obj.school.slug || ''), name: String(obj.school.name || obj.school.slug || '') }
      : (obj.school === null ? null : undefined),
  };
}

export function validatePostList(obj: any): PostList {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('PostList must be an object');
  }
  
  if (!Array.isArray(obj.items)) {
    throw new Error('PostList.items must be an array');
  }
  
  if (typeof obj.page !== 'number') {
    throw new Error('PostList.page must be a number');
  }
  
  if (typeof obj.per_page !== 'number') {
    throw new Error('PostList.per_page must be a number');
  }
  
  if (typeof obj.total !== 'number') {
    throw new Error('PostList.total must be a number');
  }
  
  const validatedItems = obj.items.map((item: any, index: number) => {
    try {
      return validatePost(item);
    } catch (error) {
      throw new Error(`PostList.items[${index}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  
  return {
    items: validatedItems,
    page: obj.page,
    per_page: obj.per_page,
    total: obj.total
  };
}
