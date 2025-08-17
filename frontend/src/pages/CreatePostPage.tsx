import React from "react";
import PostComposer from "../components/PostComposer";

export default function CreatePostPage() {
  const token = localStorage.getItem("token");
  
  if (!token) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">發佈貼文</h1>
          <p className="text-neutral-400">請先登入才能發佈貼文。</p>
        </div>
      </div>
    );
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
