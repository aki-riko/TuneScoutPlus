package web

import (
	"fmt"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/guohuiyuan/go-music-dl/core"
	"github.com/guohuiyuan/music-lib/model"
)

// RegisterJSONAPIRoutes 注册供 React 前端使用的纯 JSON 接口,挂在 /api/v1 下。
// 与原有 /music/* 的 HTMX(HTML 片段)路由并存,互不影响。
func RegisterJSONAPIRoutes(r *gin.Engine) {
	api := r.Group("/api/v1")

	api.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"app": "tunescout+", "status": "ok"})
	})

	// 可用音乐源列表(前端 source 选择用)
	api.GET("/sources", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"all":      core.GetAllSourceNames(),
			"default":  core.GetDefaultSourceNames(),
			"playlist": core.GetPlaylistSourceNames(),
			"album":    core.GetAlbumSourceNames(),
		})
	})

	api.GET("/search", jsonSearchHandler)
}

// jsonSearchSongResult 在 model.Song 基础上附带前端友好的展示字段。
type jsonSearchResponse struct {
	Songs     []model.Song     `json:"songs"`
	Playlists []model.Playlist `json:"playlists"`
	Type      string           `json:"type"`
	Keyword   string           `json:"keyword"`
	Sources   []string         `json:"sources"`
	Error     string           `json:"error,omitempty"`
}

// jsonSearchHandler 复用 core 的并发多源搜索逻辑,返回结构化 JSON
// (对应原 music.go 的 /music/search,但用 c.JSON 替代 renderIndex 的 HTML 片段)。
func jsonSearchHandler(c *gin.Context) {
	keyword := strings.TrimSpace(c.Query("q"))
	searchType := c.DefaultQuery("type", "song")
	exactArtist := strings.TrimSpace(c.Query("exact_artist"))
	sources := c.QueryArray("sources")

	if len(sources) == 0 {
		sources = defaultSourcesForSearchType(searchType)
	}

	resp := jsonSearchResponse{
		Songs:     []model.Song{},
		Playlists: []model.Playlist{},
		Type:      searchType,
		Keyword:   keyword,
		Sources:   sources,
	}

	if keyword == "" {
		resp.Error = "搜索关键词不能为空"
		c.JSON(400, resp)
		return
	}

	// 链接解析模式(粘贴歌曲/歌单/专辑链接)
	if strings.HasPrefix(keyword, "http") {
		songs, playlists, finalType, errMsg := parseLinkSearch(keyword, searchType)
		resp.Songs = songs
		resp.Playlists = playlists
		resp.Type = finalType
		resp.Error = errMsg
		if errMsg != "" {
			c.JSON(200, resp)
			return
		}
	} else {
		// 关键词多源并发搜索
		songs, playlists := concurrentKeywordSearch(keyword, searchType, sources)
		resp.Songs = songs
		resp.Playlists = playlists
	}

	if resp.Type == "song" && exactArtist != "" && len(resp.Songs) > 0 {
		resp.Songs = filterSongsByExactArtist(resp.Songs, exactArtist)
	}

	c.JSON(200, resp)
}

// concurrentKeywordSearch 多源并发搜索(从 music.go 搜索闭包提炼,去掉 HTML 渲染)。
func concurrentKeywordSearch(keyword, searchType string, sources []string) ([]model.Song, []model.Playlist) {
	allSongs := []model.Song{}
	allPlaylists := []model.Playlist{}
	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, src := range sources {
		wg.Add(1)
		go func(s string) {
			defer wg.Done()
			switch searchType {
			case "playlist":
				if fn := core.GetPlaylistSearchFunc(s); fn != nil {
					if res, err := fn(keyword); err == nil {
						for i := range res {
							res[i].Source = s
						}
						mu.Lock()
						allPlaylists = append(allPlaylists, res...)
						mu.Unlock()
					}
				}
			case "album":
				if fn := core.GetAlbumSearchFunc(s); fn != nil {
					if res, err := fn(keyword); err == nil {
						for i := range res {
							res[i].Source = s
						}
						mu.Lock()
						allPlaylists = append(allPlaylists, res...)
						mu.Unlock()
					}
				}
			default:
				if fn := core.GetSearchFunc(s); fn != nil {
					if res, err := fn(keyword); err == nil {
						for i := range res {
							res[i].Source = s
						}
						mu.Lock()
						allSongs = append(allSongs, res...)
						mu.Unlock()
					}
				}
			}
		}(src)
	}
	wg.Wait()
	return allSongs, allPlaylists
}

// parseLinkSearch 解析粘贴的链接(歌曲/歌单/专辑),返回结果与最终类型。
func parseLinkSearch(link, searchType string) ([]model.Song, []model.Playlist, string, string) {
	songs := []model.Song{}
	playlists := []model.Playlist{}

	src := core.DetectSource(link)
	if src == "" {
		return songs, playlists, searchType, "不支持该链接的解析，或无法识别来源"
	}

	if parseFn := core.GetParseFunc(src); parseFn != nil {
		if song, err := parseFn(link); err == nil {
			songs = append(songs, *song)
			return songs, playlists, "song", ""
		}
	}
	if parsePlaylistFn := core.GetParsePlaylistFunc(src); parsePlaylistFn != nil {
		if playlist, plSongs, err := parsePlaylistFn(link); err == nil {
			if searchType == "playlist" && playlist != nil {
				playlists = append(playlists, *playlist)
				return songs, playlists, "playlist", ""
			}
			songs = append(songs, plSongs...)
			return songs, playlists, "song", ""
		}
	}
	if parseAlbumFn := core.GetParseAlbumFunc(src); parseAlbumFn != nil {
		if album, alSongs, err := parseAlbumFn(link); err == nil {
			if searchType == "album" && album != nil {
				playlists = append(playlists, *album)
				return songs, playlists, "album", ""
			}
			songs = append(songs, alSongs...)
			return songs, playlists, "song", ""
		}
	}
	return songs, playlists, searchType, fmt.Sprintf("解析失败: 暂不支持 %s 平台的此链接类型或解析出错", src)
}
