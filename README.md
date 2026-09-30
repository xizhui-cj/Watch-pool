# Watch Pool · 私人放映室

个人片单、随机抽取和多设备云端同步。页面没有外部字体或脚本依赖。

## 部署

Cloudflare Worker 名称：`watch-pool`。GitHub 自动部署使用根目录配置：

- 根目录：`/`
- 构建命令：留空
- 部署命令：`npx wrangler deploy`

配置会创建 SQLite-backed Durable Object `WatchPool`，持续保存片单。不要删除其绑定、迁移记录或命名空间。GitHub 中只有访问密钥的 SHA-256 哈希；原始密钥通过私人链接交付，不写入仓库。

## 使用

每台设备打开相同的 `#key=…` 私人链接。访问密钥保存在该设备浏览器中。拥有完整私人链接的人可以读取和编辑片单。

旧页面片单保存在旧浏览器，需在旧页面点“导出”，打开新网站后点“导入”，将 JSON 文件内容粘贴进去。只需迁移一次。

新增、编辑、删除、标签和已看状态会写入云端。打开页面、切回页面以及每 15 秒刷新同步数据。断网改动暂存本机，恢复网络后重试。页面提示“已同步”后改动才已完成云端保存。

## 本地开发

```sh
npm ci
npm run dev
```

`npm run deploy` 手动部署；`npx wrangler deploy --dry-run` 检查部署配置与打包。

## 构建排查

如果旧构建报 `Could not detect a directory containing static files`，先确认该构建对应的提交包含根目录 `wrangler.jsonc`、`src/worker.js` 和 `public/index.html`。这些部署文件从提交 `1c31a7e` 开始提供。首次创建仓库时仅有 README 的旧提交无法部署网站，请构建 `main` 的最新提交。

生产分支应为 `main`，根目录为 `/`，部署命令为 `npx wrangler deploy`。重试旧构建可能仍使用旧提交；请在构建记录中确认提交 SHA。
