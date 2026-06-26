import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { getPlaylistCategories, getCategoryPlaylists } from '../services/musicdl';
import PlaylistSongs from './PlaylistSongs';

const SOURCES = [
  { key: 'netease', label: '网易云音乐' },
  { key: 'qq', label: 'QQ音乐' },
];

// 发现:按国内源的歌单分类浏览 → 选分类看歌单 → 点歌单看歌曲。
const Discover = () => {
  const [source, setSource] = useState('netease');
  const [category, setCategory] = useState(null); // {id, name}
  const [openPlaylist, setOpenPlaylist] = useState(null);

  const cats = useQuery(['categories', source], () => getPlaylistCategories([source]));
  const playlists = useQuery(
    ['cat-playlists', source, category?.id],
    () => getCategoryPlaylists(source, category.id),
    { enabled: !!category }
  );

  if (openPlaylist) {
    return (
      <div className="max-w-5xl mx-auto">
        <PlaylistSongs meta={openPlaylist} onBack={() => setOpenPlaylist(null)} />
      </div>
    );
  }

  const categoryList = cats.data?.sources?.[0]?.categories || [];
  const plList = playlists.data?.playlists || [];

  return (
    <div className="max-w-5xl mx-auto pb-32">
      <h1 className="text-4xl font-semibold mb-6 text-foreground">
        发现音乐
      </h1>

      {/* 选源 */}
      <div className="flex gap-2 mb-5">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            onClick={() => { setSource(s.key); setCategory(null); }}
            className={`px-4 py-2 border border-border rounded-md font-medium shadow-brutal-sm transition-colors ${
              source === s.key ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-secondary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 分类标签 */}
      {cats.isLoading && <p className="text-muted-foreground font-medium">加载分类…</p>}
      <div className="flex flex-wrap gap-2 mb-6">
        {categoryList.map((c) => (
          <button
            key={c.id || c.name}
            onClick={() => setCategory({ id: c.id, name: c.name })}
            className={`px-3 py-1.5 border border-border rounded-md text-sm font-medium shadow-brutal-sm transition-colors ${
              category?.id === c.id ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-secondary'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* 歌单网格 */}
      {!category && <p className="text-muted-foreground">选一个分类查看歌单。</p>}
      {category && playlists.isLoading && <p className="text-muted-foreground font-medium">加载歌单…</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {plList.map((pl) => (
          <div
            key={`${pl.source}-${pl.id}`}
            className="cursor-pointer group border border-border rounded-lg bg-card shadow-brutal-sm transition-shadow hover:shadow-fluent-lg p-2"
            onClick={() => setOpenPlaylist({ id: pl.id, source: pl.source, name: pl.name })}
          >
            <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted">
              {pl.cover && <img src={pl.cover} alt={pl.name} loading="lazy" className="w-full h-full object-cover" />}
            </div>
            <p className="text-sm font-medium mt-2 line-clamp-2">{pl.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Discover;
