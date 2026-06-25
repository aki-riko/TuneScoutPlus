import React, { useState, useRef } from 'react';
import { useQuery } from 'react-query';
import { searchMusic, getStreamUrl, getDownloadUrl } from '../services/musicdl';
import { formatDuration } from '../utils/format';

// 秒 → mm:ss(后端 duration 单位是秒,format.js 的 formatDuration 收毫秒,这里单独处理)
const fmtSec = (sec) => (sec ? formatDuration(sec * 1000) : '');
const fmtSize = (bytes) => {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
};

const Download = () => {
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [nowPlaying, setNowPlaying] = useState(null);
  const audioRef = useRef(null);

  const { data, isLoading, isError, error } = useQuery(
    ['musicdl-search', query],
    () => searchMusic(query, { type: 'song' }),
    { enabled: !!query, keepPreviousData: true }
  );

  const handleSearch = (e) => {
    e.preventDefault();
    const k = keyword.trim();
    if (k) setQuery(k);
  };

  const handlePlay = (song) => {
    const url = getStreamUrl(song);
    setNowPlaying(song);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
    }, 0);
  };

  const songs = data?.songs || [];

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold text-primary mb-2">下载 · Download</h2>
      <p className="text-gray-400 mb-6">从国内多源(网易云 / QQ / 酷狗 / 酷我 / 咪咕 / 汽水 等)搜索并下载,支持粘贴歌曲/歌单链接。</p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入歌名 / 歌手,或粘贴链接…"
          className="flex-grow px-4 py-3 rounded-lg bg-zinc-900 text-white border border-zinc-700 focus:border-primary outline-none"
        />
        <button type="submit" className="px-6 py-3 rounded-lg bg-primary text-white font-semibold hover:bg-red-600 transition">
          搜索
        </button>
      </form>

      {data?.error && <p className="text-yellow-500 mb-4">{data.error}</p>}
      {isLoading && <p className="text-gray-400">搜索中…</p>}
      {isError && <p className="text-red-500">搜索失败:{String(error?.message || error)}</p>}
      {query && !isLoading && songs.length === 0 && !data?.error && (
        <p className="text-gray-400">没有找到结果。</p>
      )}

      <div className="space-y-2">
        {songs.map((song, idx) => (
          <div
            key={`${song.source}-${song.id}-${idx}`}
            className={`flex items-center gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-primary transition ${
              nowPlaying && nowPlaying.id === song.id && nowPlaying.source === song.source ? 'border-primary' : ''
            }`}
          >
            <span className="text-gray-500 w-6 text-right">{idx + 1}</span>
            <div className="flex-grow min-w-0">
              <p className="font-semibold truncate text-white">
                {song.name}
                {song.is_vip && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-yellow-600 text-white">VIP</span>}
              </p>
              <p className="text-sm text-gray-400 truncate">
                {song.artist}{song.album ? ` · ${song.album}` : ''}
              </p>
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{song.source}</span>
            {song.duration ? <span className="text-xs text-gray-500 whitespace-nowrap">{fmtSec(song.duration)}</span> : null}
            {song.size ? <span className="text-xs text-gray-500 whitespace-nowrap">{fmtSize(song.size)}</span> : null}
            <button
              onClick={() => handlePlay(song)}
              className="px-3 py-1.5 rounded bg-zinc-700 text-white text-sm hover:bg-zinc-600 transition"
              title="在线播放"
            >
              ▶ 播放
            </button>
            <a
              href={getDownloadUrl(song)}
              className="px-3 py-1.5 rounded bg-primary text-white text-sm hover:bg-red-600 transition no-underline"
              title="下载到本地"
            >
              ↓ 下载
            </a>
          </div>
        ))}
      </div>

      {nowPlaying && (
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 p-3 z-50">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <div className="min-w-0">
              <p className="text-white truncate font-semibold">{nowPlaying.name}</p>
              <p className="text-gray-400 text-sm truncate">{nowPlaying.artist} · {nowPlaying.source}</p>
            </div>
            <audio ref={audioRef} controls className="flex-grow" />
          </div>
        </div>
      )}
    </div>
  );
};

export default Download;
