import { useEffect, useState } from 'react';
import { getQueue, approvePost, rejectPost, approveMedia, rejectMedia } from '@/api/moderation';
import io from 'socket.io-client';

export default function ModerationPage(){
  const [q,setQ] = useState<{posts:any[];media:any[]}>({posts:[],media:[]});
  const refresh = async()=> setQ(await getQueue());
  useEffect(()=>{ 
    refresh();
    const s = io('/',{path:'/socket.io'});
    s.on('post.approved',refresh); s.on('post.rejected',refresh);
    s.on('media.approved',refresh); s.on('media.rejected',refresh);
    return () => { s.close(); };
  },[]);

  return (
    <div className="p-4 grid md:grid-cols-2 gap-4">
      <section>
        <h2 className="text-xl font-bold mb-2">Pending Posts</h2>
        {q.posts.map(p=>(
          <div key={p.id} className="p-3 rounded-xl border mb-2">
            <div className="text-xs opacity-60">#{p.id}</div>
            <p className="my-2">{p.excerpt}...</p>
            <div className="flex gap-2">
              <button onClick={()=>approvePost(p.id).then(refresh)} className="px-3 py-1 rounded bg-green-600 text-white">Approve</button>
              <button onClick={()=>{const r=prompt('退件理由'); if(r) rejectPost(p.id,r).then(refresh)}} className="px-3 py-1 rounded bg-red-600 text-white">Reject</button>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">Pending Media</h2>
        {q.media.map(m=>(
          <div key={m.id} className="p-3 rounded-xl border mb-2">
            <div className="text-xs opacity-60">#{m.id}</div>
            <div className="my-2 break-all">{m.path}</div>
            <div className="flex gap-2">
              <button onClick={()=>approveMedia(m.id).then(refresh)} className="px-3 py-1 rounded bg-green-600 text-white">Approve</button>
              <button onClick={()=>{const r=prompt('退件理由'); if(r) rejectMedia(m.id,r).then(refresh)}} className="px-3 py-1 rounded bg-red-600 text-white">Reject</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
