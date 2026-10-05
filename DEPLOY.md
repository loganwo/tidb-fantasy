# 部署：真实连接平凯云 TiDB 的排行榜 / 对局数据看板

《分片城邦：TiDB幻境》已接入**真实平凯云 TiDB（Serverless，需 TLS）**——
游戏每局结束会把得分与对局流水写入 TiDB，并在「战功榜」与独立看板页实时读取。
数据库密码只存在于服务端，浏览器仅持有 API 基地址。

---

## 架构

```
 浏览器(游戏/看板页)
   │  fetch(API_BASE + /api/*)
   ▼
 排行榜后端 (Node + mysql2，TLS 连平凯云 TiDB)
   │  INSERT/SELECT
   ▼
 平凯云 TiDB  ── 表：tidb_fantasy.lb_scores / tidb_fantasy.lb_matches
```

- 游戏前端：静态托管（GitHub Pages 或 Vercel）。
- 排行榜后端：部署到 Vercel（推荐）或你的 Ubuntu 服务器，负责连 TiDB。

---

## 一、本地运行（验证用）

```bash
cd tidb-fantasy
npm install                                  # 安装 mysql2
cp server/.env.example server/.env          # 填入平凯云凭据（server/.env 已被 .gitignore 忽略）
node server/leaderboard-server.js           # 启动后访问 http://localhost:8800
```

打开 http://localhost:8800 → 主菜单点「🏆 排行榜」即可看到实时榜单；
打一局后结算界面会自动出现「🏆 看排行榜」并提示全球/分关排名。

---

## 二、把 API 部署到 Vercel（推荐，免费 HTTPS）

1. 安装并登录：`npm i -g vercel` → `vercel login`
2. 项目根目录执行：`vercel`（按提示关联/新建项目）
3. Vercel 控制台 → 项目 → **Settings → Environment Variables** 添加：
   `TIDB_HOST` / `TIDB_PORT` / `TIDB_USER` / `TIDB_PASSWORD` / `TIDB_DB`
   （值与 `server/.env` 一致）
4. 部署生产：`vercel --prod`，记下你的 API 域名，例如
   `https://tidb-fantasy-xxxx.vercel.app`

> 表会在首次请求时自动创建在 `tidb_fantasy` 库（无建库权限时回退 `sys`）。

---

## 三、让游戏连上 API

- **游戏也部署在 Vercel**（连同 `api/` 一起）：无需改动，同源 `/api` 自动可用。
- **游戏在 GitHub Pages**（子路径 `/tidb-fantasy/`）：

  把 `js/api-config.js` 里的
  ```js
  window.API_BASE = window.API_BASE || '';
  ```
  改成你的 Vercel 地址：
  ```js
  window.API_BASE = 'https://tidb-fantasy-xxxx.vercel.app';
  ```
  并把 `leaderboard.html` 顶部的默认地址同样改掉，然后重新 push。

- **游戏跑在你的 Ubuntu 服务器**（用 `node server/leaderboard-server.js`）：
  同源 `/api` 可用；若用 GitHub Pages 访问，则同样把 `API_BASE` 指向该服务器公网地址（需 HTTPS）。

---

## 四、对局数据看板（独立页）

部署后访问 `leaderboard.html`（如 `https://你的域名/leaderboard.html` 或
`https://tidb-fantasy-xxxx.vercel.app/leaderboard.html`）。页面每 15 秒自动刷新，
展示：总对局 / 胜率 / 参战指挥官数 / 最高分 / 今日对局，以及全球总榜 + 最近对局，
数据全部来自平凯云 TiDB。也可在游戏内主菜单「🏆 排行榜」的「📊 对局看板」标签查看。

---

## 五、数据库说明（评委核查用）

- 连接：`gateway01.cn-shanghai.aliyun.pingkai.cn:4000`，TLS 安全传输。
- 库：`tidb_fantasy`（自动建库；无权限则回退 `sys`）。
- 表：
  - `lb_scores`：排行榜得分（player / level / score / stars / won / duration_sec / peak_risk）。
  - `lb_matches`：对局流水（player / level / result / stars / duration_sec / peak_risk）。
- 看板聚合：`/api/stats` 返回总对局、胜率、玩家数、最高分、今日对局。

---

## 六、参赛声明（发帖务必显式写明）

> 本游戏用 **Loop** 做审计；并且排行榜与对局数据看板**真实连接平凯云 TiDB（Serverless）**，
> 每局成绩与对局流水落库 TiDB，看板实时读取——满足「部署在平凯数据库云服务 / TiDB 上」+50% 条件。

---

## 七、本次已上线（实测）

- 排行榜 API（Vercel Serverless，免费 HTTPS）已部署并验证：
  **`https://tidb-fantasy-leaderboard.vercel.app`**
  - 已关闭 Vercel Deployment Protection（Vercel Authentication），否则 GitHub Pages 上的游戏跨域调用会被拦截。
  - 公网直连 `/api/stats`、`/api/leaderboard`、`/api/score`（POST 实测落库 `tidb_fantasy`）全部正常，CORS 已放开（`Access-Control-Allow-Origin: *`）。
- 游戏侧 `js/api-config.js` 与 `leaderboard.html` 的 `API_BASE` 已指向上述地址，push 后 GitHub Pages 上的游戏即可实时读写 TiDB。
- 部署命令（留档）：在根目录用 `vercel deploy --prod --yes --name tidb-fantasy-leaderboard -e TIDB_HOST=... -e TIDB_PORT=4000 -e TIDB_USER=... -e TIDB_PASSWORD=... -e TIDB_DB=sys`（凭据走环境变量，未进仓库；`server/.env` 已被 `.vercelignore` 排除）。
