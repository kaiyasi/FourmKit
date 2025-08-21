// 暫時使用簡單的類型檢查，稍後可以替換為 zod
export interface Post {
  id: number;
  content: string;
  author_hash?: string;
  created_at?: string;
  // 用於對應樂觀更新的暫時貼文（非後端主鍵）
  client_tx_id?: string;
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
    client_tx_id: typeof obj.client_tx_id === 'string' ? obj.client_tx_id : undefined,
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
