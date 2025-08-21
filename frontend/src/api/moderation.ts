import { api } from '@/services/api';

export const getQueue = () => api<{posts:any[]; media:any[]}>(
  '/api/moderation/queue',
  { method: 'GET' }
);

export const approvePost = (id: number) => api(
  `/api/moderation/post/${id}/approve`,
  { method: 'POST' }
);

export const rejectPost = (id: number, reason: string) => api(
  `/api/moderation/post/${id}/reject`,
  { method: 'POST', body: JSON.stringify({ reason }) }
);

export const approveMedia = (id: number) => api(
  `/api/moderation/media/${id}/approve`,
  { method: 'POST' }
);

export const rejectMedia = (id: number, reason: string) => api(
  `/api/moderation/media/${id}/reject`,
  { method: 'POST', body: JSON.stringify({ reason }) }
);
