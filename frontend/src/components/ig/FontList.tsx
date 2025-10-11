/**
 * 字體列表組件
 * 顯示可用字體及其資訊
 */

import React, { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';

interface Font {
  id: number;
  font_family: string;
  display_name: string;
  description: string;
  file_format: string;
  is_chinese_supported: boolean;
  weight: string | null;
  style: string | null;
  scope: string;
  usage_count: number;
  last_used_at: string | null;
}

interface FontListProps {
  onEdit?: (font: Font) => void;
}

const FontList: React.FC<FontListProps> = ({ onEdit }) => {
  const [fonts, setFonts] = useState<Font[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'chinese' | 'latin'>('all');
  const [fontLoadStatus, setFontLoadStatus] = useState<Record<number, 'loading' | 'loaded' | 'error'>>({});

  const userRole = localStorage.getItem('role');
  const isDevAdmin = userRole === 'dev_admin';

  useEffect(() => {
    fetchFonts();
  }, [filter]);

  useEffect(() => {
    if (fonts.length === 0) return;

    fonts.forEach(font => {
      const fontFaceRule = `
        @font-face {
          font-family: '${font.font_family}';
          src: url('/api/admin/ig/fonts/${font.id}/file');
          font-weight: ${font.weight || 'normal'};
          font-style: ${font.style || 'normal'};
        }
      `;

      let styleElement = document.getElementById(`font-${font.id}`);
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = `font-${font.id}`;
        styleElement.textContent = fontFaceRule;
        document.head.appendChild(styleElement);
      }

      const checkFont = async () => {
        try {
          setFontLoadStatus(prev => ({ ...prev, [font.id]: 'loading' }));

          await document.fonts.load(`16px "${font.font_family}"`);

          await new Promise(resolve => setTimeout(resolve, 100));

          const isLoaded = document.fonts.check(`16px "${font.font_family}"`);

          setFontLoadStatus(prev => ({
            ...prev,
            [font.id]: isLoaded ? 'loaded' : 'error'
          }));
        } catch (err) {
          console.error(`Font load error for ${font.font_family}:`, err);
          setFontLoadStatus(prev => ({
            ...prev,
            [font.id]: 'error'
          }));
        }
      };

      checkFont();
    });

    return () => {
      fonts.forEach(font => {
        const styleElement = document.getElementById(`font-${font.id}`);
        if (styleElement) {
          styleElement.remove();
        }
      });
    };
  }, [fonts]);

  const fetchFonts = async () => {
    try {
      setLoading(true);
      let url = '/api/admin/ig/fonts/available?per_page=100';

      if (filter === 'chinese') {
        url += '&is_chinese_supported=true';
      } else if (filter === 'latin') {
        url += '&is_chinese_supported=false';
      }

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '載入字體失敗');
      }

      setFonts(data.fonts || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || '載入字體失敗');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted">載入中...</div>;
  }

  if (error) {
    return (
      <div className="bg-danger-bg border border-danger-border text-danger-text px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            filter === 'all'
              ? 'bg-primary text-white'
              : 'bg-surface-hover text-fg hover:bg-surface'
          }`}
        >
          全部字體
        </button>
        <button
          onClick={() => setFilter('chinese')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            filter === 'chinese'
              ? 'bg-primary text-white'
              : 'bg-surface-hover text-fg hover:bg-surface'
          }`}
        >
          中文字體
        </button>
        <button
          onClick={() => setFilter('latin')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            filter === 'latin'
              ? 'bg-primary text-white'
              : 'bg-surface-hover text-fg hover:bg-surface'
          }`}
        >
          英文字體
        </button>
      </div>

      
      {fonts.length === 0 ? (
        <div className="text-center py-8 text-muted">沒有找到字體</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fonts.map(font => (
            <div
              key={font.id}
              className="border border-border rounded-lg p-4 hover:border-primary transition-colors"
            >
              
              <div className="mb-3 p-4 bg-surface-hover rounded text-center">
                {fontLoadStatus[font.id] === 'loading' && (
                  <div className="text-sm text-muted py-2">載入中...</div>
                )}
                {fontLoadStatus[font.id] === 'error' && (
                  <div className="text-sm text-danger-text py-2">
                    ⚠️ 字體載入失敗或瀏覽器不支援此字體
                  </div>
                )}
                {fontLoadStatus[font.id] === 'loaded' && (
                  <div
                    className="text-2xl"
                    style={{ fontFamily: font.font_family }}
                  >
                    {font.is_chinese_supported ? '你好世界 Hello World' : 'Hello World'}
                  </div>
                )}
                {!fontLoadStatus[font.id] && (
                  <div
                    className="text-2xl"
                    style={{ fontFamily: font.font_family }}
                  >
                    {font.is_chinese_supported ? '你好世界 Hello World' : 'Hello World'}
                  </div>
                )}
              </div>

              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{font.display_name}</h3>
                  <div className="flex gap-2 items-center flex-wrap">
                    
                    {font.is_chinese_supported && (
                      <span className="px-2 py-1 bg-success-bg text-success-text text-xs rounded">
                        中文
                      </span>
                    )}
                    <span className="px-2 py-1 bg-info-bg text-info-text text-xs rounded">
                      英文
                    </span>
                    
                    <span className="px-2 py-1 bg-surface-hover text-muted text-xs rounded border border-border">
                      {font.scope === 'global' ? '全域' : '學校'}
                    </span>
                    
                    {isDevAdmin && onEdit && (
                      <button
                        onClick={() => onEdit(font)}
                        className="p-1.5 hover:bg-surface-hover rounded transition-colors text-primary"
                        title="編輯字體"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-sm text-muted space-y-1">
                  <div>字體家族：<span className="font-mono">{font.font_family}</span></div>
                  {font.description && <div>描述：{font.description}</div>}
                  <div className="flex gap-4">
                    <span>格式：{font.file_format.toUpperCase()}</span>
                    {font.weight && <span>字重：{font.weight}</span>}
                    {font.style && font.style !== 'normal' && <span>樣式：{font.style}</span>}
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span>使用次數：{font.usage_count}</span>
                    {font.last_used_at && (
                      <span>最後使用：{new Date(font.last_used_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FontList;
