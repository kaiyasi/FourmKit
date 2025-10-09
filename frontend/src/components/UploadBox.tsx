import { useState } from 'react';

interface Props {
  postId: number;
  token: string;
  onUploaded?: (m: {media_id:number; path:string; status:string}) => void;
}

export default function UploadBox({ postId, token, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('post_id', String(postId));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/posts/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        onUploaded?.(res);
      } else {
        alert('Upload failed');
      }
      setProgress(0);
    };
    xhr.send(formData);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer ${
        dragging ? 'bg-gray-800 border-blue-500' : 'bg-gray-900 border-gray-700'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.jpg,.jpeg,.png,.webp,.mp4,.webm';
        inp.onchange = () => { if (inp.files?.[0]) handleUpload(inp.files[0]); };
        inp.click();
      }}
    >
      <p className="text-gray-400">拖拉或點擊以上傳 (jpg/png/webp/mp4/webm)</p>
      {progress > 0 && (
        <div className="mt-2 h-2 bg-gray-700 rounded">
          <div className="h-2 bg-blue-500 rounded" style={{ width: `${progress}%` }}></div>
        </div>
      )}
    </div>
  );
}
