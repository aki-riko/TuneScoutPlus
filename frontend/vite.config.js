import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// TuneScout+ 前端构建配置(从 CRA 迁移而来)。
export default defineConfig({
  plugins: [react()],
  // 相对基址,适配本地全栈部署(前后端同源)与子路径托管。
  base: './',
  server: {
    port: 3000,
  },
  // 本项目沿用 CRA 习惯,JSX 写在 .js 文件中;让 esbuild 按 jsx 解析 .js。
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  build: {
    outDir: 'build', // 沿用 CRA 的输出目录名,兼容已有部署习惯
  },
});
