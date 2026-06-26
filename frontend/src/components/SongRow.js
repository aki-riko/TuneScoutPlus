import React from 'react';
import { getStreamUrl, getDownloadUrl } from '../services/musicdl';
import { formatDuration } from '../utils/format';

const fmtSec = (sec) => (sec ? formatDuration(sec * 1000) : '');
const fmtSize = (bytes) => {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
};

// 单首歌曲行:歌曲搜索结果与歌单/专辑详情共用。
const SongRow = ({ song, index, isPlaying, onPlay, onShowLyric }) => (
  <div
    className={`flex items-center gap-3 p-3 border-2 border-border bg-card text-card-foreground transition-all ${
      isPlaying ? 'shadow-brutal -translate-x-0.5 -translate-y-0.5' : 'shadow-brutal-sm'
    }`}
  >
    <span className="text-muted-foreground font-bold w-6 text-right">{index + 1}</span>
    <div className="flex-grow min-w-0">
      <p className="font-bold truncate">
        {song.name}
        {song.is_vip && <span className="ml-2 text-xs font-bold px-1.5 py-0.5 border-2 border-border bg-primary text-primary-foreground">VIP</span>}
      </p>
      <p className="text-sm text-muted-foreground truncate">
        {song.artist}
        {song.album ? ` · ${song.album}` : ''}
      </p>
    </div>
    <span className="text-xs font-bold text-muted-foreground whitespace-nowrap uppercase">{song.source}</span>
    {song.duration ? <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtSec(song.duration)}</span> : null}
    {song.size ? <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtSize(song.size)}</span> : null}
    {onShowLyric && (
      <button
        onClick={() => onShowLyric(song)}
        className="px-3 py-1.5 border-2 border-border bg-card font-bold text-sm shadow-brutal-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        title="查看歌词"
      >
        词
      </button>
    )}
    <button
      onClick={() => onPlay(song)}
      className="px-3 py-1.5 border-2 border-border bg-card font-bold text-sm shadow-brutal-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      title="在线播放"
    >
      ▶ 播放
    </button>
    <a
      href={getDownloadUrl(song)}
      className="px-3 py-1.5 border-2 border-border bg-primary text-primary-foreground font-bold text-sm shadow-brutal-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none no-underline"
      title="下载到本地"
    >
      ↓ 下载
    </a>
  </div>
);

export { getStreamUrl };
export default SongRow;
