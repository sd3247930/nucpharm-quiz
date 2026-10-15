# 本地构建与自动发布

本项目使用 uni-app / Vue 3，根目录可直接在 HBuilderX 打开。没有 Capacitor 工程，不使用 `cap sync android`。

## 环境及网页构建

需要 Node.js 22+、npm、Python 3.12+。构建 APK 另外需要 JDK 17、Android SDK Build Tools 36.0.0；资产校验需要 Pillow。

```sh
npm ci
npm test
npm run audit:check
npm run test:security
npm run build:h5
npm run build:app
```

网页产物为 `unpackage/dist/build/web`，App 业务资源为 `unpackage/dist/build/app-plus`。不需要私有题源或本地文档。不要运行题库导入器，除非正在维护原始题源。

本地预览：`python -m http.server 8080 --directory unpackage/dist/build/web`，浏览器打开本地 8080 端口。Web 构建后运行 `npm run test:e2e`，需要 Edge / Chrome，可通过 `CHROME_PATH` 指定。测试结果写入被忽略的 `docs/`，不进入提交和 Release。

也可在 HBuilderX App 开发版打开根目录，通过「运行 → 运行到手机或模拟器」调试，或「发行 → 原生 App 本地打包」生成新的原生 APK。

## 本地 Android 构建

设置 `ANDROID_HOME` 为自己的 SDK 目录，让 `java`、`keytool`、`python` 在终端可执行；也可指定 `ANDROID_BUILD_TOOLS` 为 36.0.0 工具目录。

```sh
npm ci
npm run build:android
```

脚本自动编译业务资源、下载并校验 `android-runtime.json` 固定的 HBuilderX 运行壳、装入全部编译资源、执行 ZIP 对齐和签名验证。输出 `unpackage/releases/NucPharm.apk` 及 `.sha256`。无正式签名配置时，本地自动使用 `private/android-signing/local-debug.keystore` 中持久化的调试证书；调试包无法覆盖正式版，仅供开发验证，请勿公开发布。

正式包使用以下环境变量，值由维护者私下配置，不能写入源码、文档、命令历史或日志：

| 环境变量 | 含义 |
|---|---|
| `ANDROID_KEYSTORE` | 自有证书文件路径 |
| `ANDROID_STORE_PASSWORD` | 证书库密码 |
| `ANDROID_KEY_PASSWORD` | 私钥密码 |
| `ANDROID_KEY_ALIAS` | 证书别名 |

```sh
npm run build:android -- --require-release
```

正式包签名必须与原运行壳一致，才能覆盖原安装并保留数据。密钥丢失后无法为原安装身份签名更新，请独立备份。

## 原生构建边界

自动 APK 流程是 **编译业务资源 → 复用已验证原生壳 → 正式签名**，并不重新编译 DCloud 原生引擎。[DCloud CLI](https://uniapp.dcloud.net.cn/worktile/CLI.html) 的 App 输出是业务资源，不能单独生成原生 APK。每次均重新编译业务资源和全部页面 CSS；运行壳提供当前高清桌面图标及启动配置。

当前原生版本为 1.0.0，延续原已安装 APK 的包名和签名。工程配置目标包名与原本地包的默认包名存在历史差异，脚本保留已安装身份。更改包名、AppID、原生版本、权限、插件、引擎或桌面图标时，先在 HBuilderX 使用原包名及原证书重新打包和真机验证，再发布新的运行壳资产，更新 `android-runtime.json` 的 URL / SHA-256 / 编译器版本及 npm 锁文件。AppID 或版本不匹配时脚本会拒绝构建。

普通页面/业务资源更新可使用 `v1.0.0-ui.1` 等 Release 标签，原生显示版本仍为 1.0.0。

## GitHub Actions Releases 自动出包

在仓库 Settings → Secrets and variables → Actions 配置以下 Repository Secrets：

| Secret | 内容 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 正式证书文件的 Base64 编码 |
| `ANDROID_STORE_PASSWORD` | 证书库密码 |
| `ANDROID_KEY_PASSWORD` | 私钥密码 |
| `ANDROID_KEY_ALIAS` | 证书别名 |

仅签名步骤读取这些值，PR 验证不读取签名 Secrets；公开发行缺少正式证书时直接失败，不会自动发布 debug 包。

任选一种方式发布：

1. 推送 `v*` 标签，例如 `v1.0.0-ui.1`，Actions 完成后自动创建 Release 并上传 APK。
2. 在 GitHub 发布同类标签的 Release，工作流自动附上 APK。
3. 在 Actions → Android Release 手动输入已存在的版本标签运行。

工作流先执行核心测试和公开范围安全检查，再编译、校验运行壳、签名，核对全部编译资源和原生文件，只上传 `NucPharm.apk` 与 `.sha256`。固定直链：[最新版 APK](https://github.com/sd3247930/nucpharm-quiz/releases/latest/download/NucPharm.apk)。它指向最新非预发布 Release；预发布版本从版本列表下载。Deploy Web 自动部署 GitHub Pages。

## 发布前检查

```sh
python -m pip install pillow
python scripts/audit-question-bank.py
python scripts/verify-assets.py
python scripts/security-audit.py
npm test
npm run build:h5
npm run test:e2e
```

`private/`、`docs/`、密钥、设备数据、日志和测试产物不公开。公开分支使用干净历史，不要推送未经检查的旧本地分支或标签。保留原 DCloud 编译器与原生壳，针对底层安全版本设置显式覆盖并执行兼容性回归，避免 `npm audit fix --force` 破坏配套版本，不要把开发服务器暴露到公网。

原 43 项审计告警已通过升级及 `braces` 本地安全回补处理。详见 [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md)。不同 npm 版本对本地 file 依赖的审计行为不同，审计也无法判断源码回补是否有效，因此三个发行工作流同时执行 `npm run audit:check` 和 `npm run test:security`，不能只看审计数字或跳过恶意输入回归。
