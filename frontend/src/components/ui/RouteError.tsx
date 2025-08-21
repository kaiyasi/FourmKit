import React from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { messageFrom } from '@/utils/errors';
import { ShieldAlert, AlertTriangle, SearchX, Home } from 'lucide-react';

export default function RouteError() {
	const error = useRouteError();
	let message = '未知錯誤';
	let statusCode: number | undefined;
	let title = '發生錯誤';
	let Icon: any = AlertTriangle;

	if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    // 直接利用集中訊息工具
    try {
      // @ts-ignore - may not exist
      const data = error.data;
      message = messageFrom(statusCode, data, `${error.status} ${error.statusText || ''}`.trim());
    } catch {
      message = messageFrom(statusCode, undefined, `${error.status} ${error.statusText || ''}`.trim());
    }
  } else if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object') {
    // 最後防線：將物件安全轉字串，避免 React #31
    // @ts-ignore
    message = error?.message ? String(error.message) : JSON.stringify(error);
  }

	if (statusCode === 403) { title = '沒有權限'; Icon = ShieldAlert; }
	else if (statusCode === 404) { title = '找不到頁面'; Icon = SearchX; }

	return (
		<div className="min-h-screen grid place-items-center p-6">
			<div className="max-w-lg w-full rounded-2xl border border-border bg-surface p-6 shadow-soft text-center">
				<div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3">
					<Icon className="w-6 h-6 text-amber-700 dark:text-amber-300" />
				</div>
				<h1 className="text-2xl font-bold dual-text mb-1">{title}</h1>
				<p className="text-sm text-muted mb-4 whitespace-pre-wrap break-words">{message}</p>
				<a href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border hover:bg-surface/80 text-sm">
					<Home className="w-4 h-4" /> 回到首頁
				</a>
			</div>
		</div>
	);
}
