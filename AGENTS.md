# 收尾闸门：改动必须落到线上

本文件的唯一目的：消灭"改完就结束、代码烂在本地"这个反复出现的失败模式。
**任何一次代码/文案/配置改动，未走完下面 6 步就不算完成，不得向用户声明"已完成"。**

## 定义完成（Definition of Done，按顺序全做）

1. **自测**：改动面相关的门禁跑绿（`test:p0` 系列 / `check:imports` / `lint:ui` / `lint:routes` / `lint`）。
   注意 `npm run test:p0` 必须走 npm script（带 server-only loader），裸 `node --test` 的结论不可信。
2. **提交**：只提交属于本次任务的那一刀（见下"并发工作树"）。
3. **推送**：`git push origin main` 完成，且 `git rev-list --count origin/main..HEAD` 为 **0**。
   本地领先 GitHub 就是未完成，没有例外。
4. **部署**：产物上线到 `www.koyosim.com`（见下"部署"）。
5. **线上验收**：以线上真实响应为准，不看本地文件。
   `cat /home/wwwroot/AI/domain/koyosim.com/web/.next/BUILD_ID` 必须等于本次产物，
   再跑 `.agents/ship-verify.sh`（逐路由状态码/标题/chunk 完整性），UI 项再经 `tunnel.py 3101→3100` 打开线上页面读**计算后**的样式。
6. **收口声明**：向用户报告时明确给出 commit 号、是否已推送、线上 BUILD_ID、验收结论。

## 开工前先对账，不要假设自己是干净的

每次任务开始先跑：

```bash
git rev-list --left-right --count origin/main...HEAD   # 右值 = 本地积压未推送的提交数
git status --porcelain | wc -l                          # 工作树脏文件数（含他人改动）
MSYS2_ARG_CONV_EXCL='*' python .agents/rssh.py 'cat /home/wwwroot/AI/domain/koyosim.com/web/.next/BUILD_ID'
```

**发现前序积压时先补积压，再开新功能**；确实无法本次补上的，必须在回复里点名列出，不许静默。

## 并发工作树：只提自己那一刀

`H:\03 Dev  Lake` 被多个会话同时写入（实测一次 83 秒构建窗口内他人改了 72 个文件）。

- **禁止** `git add -A` / `git commit -a` / `git commit <path>`：会把他人未完成的在途工作一起带走。
- 用临时索引法：`GIT_INDEX_FILE=.git/index-x git read-tree HEAD` → 只 `git add` 自己独占的整文件；
  共享文件（`lib/admin/navigation.js`、`messages/*/common.json`、`app/globals.css`、`tailwind.config.js`、
  `components/admin/*`、`scripts/ui-token-baseline.json`、`.env.example`）要 `hash-object -w --path=` 手写分片版本，
  再 `update-index --cacheinfo`；删除用 `--force-remove`；最后 `write-tree` → `commit-tree -p HEAD` →
  `update-ref refs/heads/main <new> <old>`（带旧值即 CAS，挡并发）。
- 提完把同样这批路径写回**真实索引**，并手动 `sh .git/hooks/post-commit` 补归属统计。
- 例外：三个子模块（`Vibe-Workflow` / `Open-Poe-AI` / `Open-AI-Design-Agent`）的 origin 是第三方上游，
  本地 gitlink 推不出去，属既有状态，不算违规，但要在报告里说明。

## 部署：热树不得就地构建

判据：`find app components lib messages scripts -newermt "<构建起点>"` 非空 → 工作树是热的，
就地 `next build` 的产物不可信（会把别人的半成品推上生产，或本身撕裂）。

此时走**快照上线法**：拉线上源码为基线 → `git archive <本次提交> $(git diff-tree -r --name-only <提交>)`
只覆盖自己那批路径 → 补 `src i18n tests` 与配置文件 → `node_modules` 用 junction 复用
（根 `node_modules/studio` 是绝对链接，必须改指快照内那份）→ `NEXT_DIST_DIR=.next-shipbuild npx next build`
→ 校验 `BUILD_ID` 与 `app-paths-manifest.json` 路由集 **LOST=0** → 上传 → 部署。

覆盖共享文件前先逐文件 diff 线上基线，确认差异只有自己的 hunk。

- 上传只能 `python .agents/rput_bin.py <本地> <远端> "<校验命令>"`（服务器无 SFTP，`scp` 不可用），
  归档要 `tar --exclude="*/cache"`。
- 远端跑脚本：先 `rput_bin.py` 上去，再 `rssh.py 'tr -d "\r" < 远端 | bash'`（Windows 上传的脚本带 CRLF）。
- **回滚**：线上 `.next-previous` 保留上一版产物，换目录名 + `systemctl restart koyosim.service` 即回退。
  部署后自检不过，第一动作是回滚，不是继续改。

## 网络与工具约束（踩过才写下的）

- 调用 `.agents/*.py` 一律带 `MSYS2_ARG_CONV_EXCL='*'`，否则 Git Bash 把 `/home/...` 改写成 `C:/Program Files/Git/...`。
- 本机出口若被判境内，`curl https://www.koyosim.com` 拿到的是自家门禁 403（响应体 `<center>nginx</center>`），不是故障；
  黑盒验收走 `python .agents/tunnel.py 3101 127.0.0.1 3100`。
- `git push` 直连 github.com 会超时，用 `python .agents/tunnel.py 443 github.com 443` +
  `git -c "http.curloptResolve=github.com:443:127.0.0.1" push origin main`；
  推完按 PID `taskkill` 掉隧道并确认 `netstat` 无监听（Git Bash 的 `pkill` 杀不掉 Windows 进程）。
- 新增 npm 依赖不会随上线自动生效（部署从不跑 `npm install`），要外科式补 `tar node_modules/<pkg>` 上去；
  绝不在活机上 `npm install`。

## 真的上不了线时

允许不部署，但必须显式写明：**阻塞原因 + 已做到哪一步 + 待办清单 + 谁能在什么条件下补做**。
"环境复杂""工作树是脏的""担心影响别人"都不构成免检理由。沉默地把未上线的改动当成完成，是本文件禁止的头号行为。
