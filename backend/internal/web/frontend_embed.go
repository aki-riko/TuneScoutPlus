package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

// frontendDistFS 嵌入 React 前端构建产物(frontend/build/*)。
// 占位目录含一个 index.html;Docker 构建时会把真正的产物拷进 frontend_dist/ 再编译。
//
//go:embed all:frontend_dist
var frontendDistFS embed.FS

// registerFrontend 在根路径托管 React 单页应用(SPA)。
// 静态资源按真实路径返回;未命中的路径回退到 index.html(交给前端路由)。
// API 路径(/api、/music)由各自的路由处理,不会进到这里。
func registerFrontend(r *gin.Engine) {
	sub, err := fs.Sub(frontendDistFS, "frontend_dist")
	if err != nil {
		return
	}
	fileServer := http.FileServer(http.FS(sub))

	// 直接读出 index.html 内容返回,避免 FileServer 对 "/" 触发 "./" 目录重定向(死循环)。
	indexHTML, _ := fs.ReadFile(sub, "index.html")
	serveIndex := func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	}

	// 根路径返回 SPA 入口
	r.GET("/", serveIndex)

	// NoRoute:静态资源直出,其余回退 index.html(SPA 前端路由)。
	// 已注册的 /api/*、/music/* 命中各自路由,不会落到 NoRoute。
	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		// API/后端路径未命中时不应返回前端页面,保持 404 语义。
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, RoutePrefix+"/") {
			c.Status(http.StatusNotFound)
			return
		}
		// 探测静态文件是否存在(去掉前导斜杠)
		clean := strings.TrimPrefix(path.Clean(p), "/")
		if clean != "" && clean != "." {
			if f, err := sub.Open(clean); err == nil {
				f.Close()
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
		}
		// 其余路径回退到 SPA 入口
		serveIndex(c)
	})
}
