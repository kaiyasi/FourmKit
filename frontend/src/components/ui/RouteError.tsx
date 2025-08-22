import React from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { messageFrom } from '@/utils/errors';
import ErrorPage from '@/components/ui/ErrorPage'

export default function RouteError() {
	const error = useRouteError();
	let message = '未知錯誤';
	let statusCode: number | undefined;

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

	return <ErrorPage status={statusCode} message={message} />
}
