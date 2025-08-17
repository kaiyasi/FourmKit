import React from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

export default function RouteError() {
	const error = useRouteError();
	let message = '未知錯誤';
	let statusText = '';

	if (isRouteErrorResponse(error)) {
		message = `${error.status} ${error.statusText || ''}`.trim();
		try {
			// 某些情況下 loader/action 會丟出 JSON
			// @ts-ignore - may not exist
			const data = error.data;
			if (data && typeof data === 'object') {
				// 嘗試從標準化錯誤物件取 message
				// @ts-ignore
				const maybe = data?.error?.message || data?.message;
				if (maybe) message = String(maybe);
			}
		} catch {}
	} else if (error instanceof Error) {
		message = error.message;
	} else if (error && typeof error === 'object') {
		// 最後防線：將物件安全轉字串，避免 React #31
		// @ts-ignore
		message = error?.message ? String(error.message) : JSON.stringify(error);
	}

	return (
		<div className="min-h-screen grid place-items-center p-6">
			<div className="max-w-lg w-full rounded-2xl border border-border bg-surface p-6 shadow-soft">
				<h1 className="text-xl font-semibold dual-text mb-2">發生錯誤</h1>
				<p className="text-sm text-fg whitespace-pre-wrap break-words">{message}</p>
				<div className="mt-4 text-right">
					<a href="/" className="text-sm underline text-muted">回到首頁</a>
				</div>
			</div>
		</div>
	);
}
