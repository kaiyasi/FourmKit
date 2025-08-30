import React from 'react';

interface ErrorBoxProps {
	message: unknown;
	title?: string;
	className?: string;
}

export function ErrorBox({ message, title = "發生錯誤", className = "" }: ErrorBoxProps) {
	// 確保 message 是字串
	const safeMessage = typeof message === 'string' 
		? message 
		: message && typeof message === 'object' && 'message' in (message as any)
		? String((message as any).message)
		: String(message);

	return (
		<div 
			role="alert" 
			className={`border border-red-400 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-100 p-3 rounded-xl ${className}`}
		>
			<h4 className="font-semibold text-sm mb-1">{title}</h4>
			<p className="text-sm whitespace-pre-wrap">{safeMessage}</p>
		</div>
	);
}

export default ErrorBox;
