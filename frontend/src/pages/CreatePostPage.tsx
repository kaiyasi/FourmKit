import React from "react";
import PostComposer from "../components/PostComposer";
import ErrorPage from '@/components/ui/ErrorPage'

export default function CreatePostPage() {
  const token = localStorage.getItem("token");
  
  if (!token) {
    return <ErrorPage status={401} title="需要登入" message="請先登入才能發佈貼文" actionHref="/auth" actionText="前往登入" />
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">發佈新貼文</h1>
        <PostComposer token={token} />
      </div>
    </div>
  );
}
