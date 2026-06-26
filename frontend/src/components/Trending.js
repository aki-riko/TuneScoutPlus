import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { getRecommend } from '../services/musicdl';
import PlaylistSongs from './PlaylistSongs';

// 热门:展示国内各源(网易云/QQ)的推荐歌单,点进看歌曲并播放/下载。
const Trending = () => {
  const [open, setOpen] = useState(null); // {id, source, name}
  const { data, isLoading, isError } = useQuery(['trending-recommend'], () =>
    getRecommend(['netease', 'qq'])
  );

  if (open) {
    return (
      <div className="max-w-5xl mx-auto p-4">
        <PlaylistSongs meta={open} onBack={() => setOpen(null)} />
      </div>
    );
  }

  const tabs = data?.tabs || [];
  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-4xl font-semibold mb-6 text-foreground">
        热门推荐
      </h1>
      {isLoading && <p className="text-muted-foreground font-medium">加载中…</p>}
      {isError && <p className="text-destructive font-medium">获取热门推荐失败</p>}
      <div className="space-y-8 pb-32">
        {tabs.map((tab) => (
          <div key={tab.source}>
            <h3 className="text-xl font-semibold mb-3 text-foreground">
              {tab.source_name || tab.source}
            </h3>
            {tab.error && <p className="text-destructive font-medium text-sm mb-2">{tab.error}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-3">
              {(tab.playlists || []).map((pl) => (
                <div
                  key={`${pl.source}-${pl.id}`}
                  className="cursor-pointer group border border-border rounded-lg bg-card shadow-brutal-sm transition-shadow hover:shadow-fluent-lg p-2"
                  onClick={() => setOpen({ id: pl.id, source: pl.source, name: pl.name })}
                >
                  <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted">
                    {pl.cover && <img src={pl.cover} alt={pl.name} loading="lazy" className="w-full h-full object-cover" />}
                  </div>
                  <p className="text-sm font-medium mt-2 line-clamp-2">{pl.name}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Trending;
