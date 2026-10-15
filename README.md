# 核药通 · NucPharm

核药学与放射药剂学学习工具，内置 **620 道题**，支持离线练习、模拟考试、错题复习和进度备份。基于 uni-app / Vue 3，提供 Android APK 与移动网页版。

[📲 下载 Android](https://github.com/sd3247930/nucpharm-quiz/releases/latest/download/NucPharm.apk) · [🌐 打开网页版](https://sd3247930.github.io/nucpharm-quiz/) · [版本记录](https://github.com/sd3247930/nucpharm-quiz/releases) · [构建说明](BUILD.md)

当前版本 **1.01**。版本按十进制递增：小改动 **+0.01**，大改动 **+0.10**，统一保留两位小数。发布命令与 npm 内部版本映射见 [BUILD.md](BUILD.md#版本号规则)。

## 安装使用

### 方式一：手机直接安装（推荐）

1. 手机浏览器打开 [核药通网页版](https://sd3247930.github.io/nucpharm-quiz/)。
2. 点右上角 **「📲 安装」**，在面板中点 **「📥 下载应用（APK）」**。
3. 下载后点安装；首次安装按浏览器提示允许安装此应用。
4. 桌面出现 **核药通** 图标，打开即可使用，Android 版无需联网刷题。
5. 迁移进度：先在网页 **「设置 → 导出学习进度」** 保存 JSON，再在 App **「设置 → 导入进度备份」** 选择文件，核对预览后确认导入。

**固定 APK 直链：**[下载最新版 NucPharm.apk](https://github.com/sd3247930/nucpharm-quiz/releases/latest/download/NucPharm.apk)，可直接转发给同事。每个 Release 同时提供 SHA-256 校验文件。

iPhone / iPad 可用 Safari 打开网页版，在分享菜单选择「添加到主屏幕」。网页版首次及重新加载需要网络，学习记录保存在当前浏览器；换浏览器或换设备需手动备份迁移，不会自动同步。

### 方式二：本地构建

```sh
npm ci
npm run build:android
```

需要 Node.js 22+、Python、JDK 17 和 Android SDK。无正式签名配置时本地使用调试证书；正式发布必须使用原证书。环境配置、HBuilderX 运行方式及自动出包边界见 [BUILD.md](BUILD.md)。

## 五个页面

| 页面 | 主要功能 |
|---|---|
| 首页 | 学习覆盖率、续练、模拟考试入口和最近成绩 |
| 练习 | 单选/多选/判断筛选，顺序/随机练习，详解开关、法规弹窗、错题/收藏复习及笔记 |
| 考试 | 70 题模拟卷、倒计时、答题卡、退出恢复、交卷判分及逐题复盘 |
| 错题 | 错题累计管理、答案折叠、收藏、复习后移出 |
| 设置 | 深浅主题、三档字号、考试时长、自动跳题、题库自检、存储管理及备份 |

五个入口共用柔和蓝紫渐变的高清底栏图标，「错题」保留红色提示。图标 34px、文字 13px、栏高 74px，适配深浅主题和底部手势安全区；选中项通过加深颜色与短横线共同标识。Android 保留原生导航和页面缓存。

题库组成：**单选 400 / 多选 110 / 判断 110**。模拟考试固定 **40 道单选 + 10 道多选 + 20 道判断，满分 100 分**；默认 60 分钟，可在设置中调整为 30 / 45 / 60 / 90 分钟。多选按全部正确判分，不计部分分。

学习覆盖率按做过的不同题目计算；错题、收藏、笔记和考试历史独立保存。备份导入经过结构校验与预览确认，写入失败时回滚，避免部分数据覆盖。

练习页学习概况采用 2×2 布局，依次展示已做不同题、累计准确率、当前错题和笔记数。顺序与随机练习可控制作答后是否展示详解；法规条文默认收起，点击「法规」查看。笔记采用统一卡片样式，题源仅显示题型和题号。

## 开发与测试

```sh
npm ci
npm test                 # 核心单元 / 集成测试
npm run version:check     # 核对应用、npm 与生成文件的版本一致性
npm run audit:check       # 注册表依赖漏洞检查（low 及以上即失败）
npm run test:security     # 本地补丁和恶意输入安全回归
npm run test:android-package # APK 资源清单与原生配置保留回归
npm run build:h5          # 构建网页
npm run test:e2e          # Edge / Chrome 真实浏览器回归
npm run build:app         # 编译 uni-app Android 业务资源
```

也可在 HBuilderX App 开发版打开工程根目录，通过「运行 → 运行到手机或模拟器」调试。仓库包含已经校验的题库产物，构建不依赖私有题源；维护题源时另行使用导入脚本。

```text
components/        共享页头、题卡、弹窗与安装面板
core/              判分、抽卷、会话、存储、备份与启动逻辑
pages/             五个一级页面和答题 / 成绩 / 复盘页面
static/            内置题库、高清品牌资源与底栏图标
assets/navigation/ 底栏 SVG 母版（生成浅色/深色的普通与选中图标）
nativeResources/   Android 原生图标配置
scripts/           构建、签名、资源验证及安全检查
tests/             单元、集成与浏览器测试
.github/workflows/ 验证、网页部署、Android Release 自动出包
```

**GitHub Actions 自动发布：**推送版本标签或发布 Release 后，Android Release 工作流自动编译当前业务资源、装入经过校验的 HBuilderX 原生运行壳、使用正式证书签名并上传 APK。网页由 Deploy Web 部署。原生版本更新和签名配置步骤见 [BUILD.md](BUILD.md)。

依赖安全版本和本地补丁说明见 [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md)；发布前同时执行漏洞审计与安全回归。

## 数据与隐私

- Android 版题库内置，练习和考试可完全离线；学习记录保存在本机，无账号或自动云同步。
- 未启用 uni 统计及学习记录上报。网页版打开 GitHub Pages、下载安装包会访问 GitHub。
- 备份 JSON 包含自己的进度和笔记，请自行保管；升级前建议先导出备份。
- `private/`、`docs/`、密钥、设备数据、原始日志、测试报告和构建中间文件均不纳入公开 Git 历史；安装包通过 Releases 分发。

题库用于学习与自测，原始题源中的重复题和特殊题型标注保留，未擅自修改答案。发现题目问题可在 Issue 中提供题目 ID 及依据。
