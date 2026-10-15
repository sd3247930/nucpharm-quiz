# 依赖安全修复

2026-10-15：原始 npm audit 为 43 项（30 high、6 moderate、7 low）。通过升级实际依赖和回补无官方修复版的漏洞处理，不使用 `--force`、`--legacy-peer-deps`、审计排除或提高阈值来隐藏告警。

## 版本升级

| 范围 | 修复版本 | 处理 |
|---|---|---|
| Vue / SSR | 3.5.42 | Vue 及所有 server-renderer 统一到修复版本，验证恶意含回车属性名不能生成执行属性 |
| vue-i18n / Intlify | 9.14.5 / message-resolver 9.1.11 | 修复 XSS 及原型污染；同时覆盖编译器固定的旧传递依赖 |
| Vite | 6.4.3 | 修复开发服务器文件访问绕过；显式覆盖 DCloud 原先的 5.2.8 版本约束 |
| Babel | 7.29.7 | 修复编译时 sourceMappingURL 任意文件读取 |
| esbuild | 0.25.12 | 修复开发服务器跨站读取 |
| adm-zip | 0.6.1 | 修复压缩包读取、解压和资源耗尽问题 |
| PostCSS / selector parser | 8.5.23 / 7.1.6 | 修复 source map 文件读取及选择器解析问题 |
| source-map-js | 1.2.2 | 修复构造 source map 导致的资源耗尽 |
| Express / qs | 4.22.3 / 6.16.0 | 更新 HTTP 解析、路由、cookie 及静态资源相关传递依赖 |
| Sass | 1.105.1 | 更新旧文件监听依赖链 |

精确版本及覆盖范围以 `package.json` 和 `package-lock.json` 为准。DCloud 编译器及 Android 原生壳保持原配套版本；这里的覆盖已经过本项目的网页和 App 构建验证，不代表 DCloud 官方宣称支持所有组合。不要移除覆盖后继续使用旧锁文件。

## braces 本地回补

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 当前没有官方已发布修复版。使用 [vendor/braces](vendor/braces/PATCH.md) 的可审查源码回补，保留 MIT 许可证及上游 3.0.3 来源校验记录，以独立身份 `@nucpharm/braces-backport@3.0.3-nucpharm.1` 明确标记本地维护版本，没有冒充官方新版本。根依赖通过 `braces` 别名保持调用兼容。

补丁在解析器限制括号嵌套，并迭代校验直接传入递归 API 的 AST 深度、数量和循环子节点。普通 glob、数值范围及转义行为保持；数千层恶意输入以明确错误拒绝。`micromatch` 和 `chokidar` 实际加载路径也在回归测试中核对。

**npm 10 与 npm 11 对 file 依赖的审计行为不同，注册表审计也无法判断本地源码回补是否有效，所以更名或数字为零都不够。** 必须同时运行下面的恶意输入回归，核验实际加载的代码确实拒绝攻击，并在两个 npm 主版本中验证。跟踪上游正式修复后替换本地补丁，不能只删除回归测试或改版本号。

## 必须通过的验证

```sh
npm ci
npm run audit:check
npm run test:security
npm test
npm run build:h5
npm run test:e2e
npm run build:app
```

`audit:check` 在发现 low 或以上漏洞时失败；7 项独立安全回归验证递归攻击、AST 绕过、实际模块解析和 Vue SSR 属性注入。验证、网页部署、Android 发布三个 Actions 均执行审计和安全回归，失败后停止构建/发布。构建工具的 API 弃用提示与安全审计是两类问题，不能将弃用提示当作已修复的漏洞，或反过来忽略漏洞。

此次升级没有改题库、数据格式或存储键。Android 资源仍装入原签名运行壳，正式发行验证签名连续性，以支持保留原学习数据覆盖更新。

## 上游依据

- [Vue SSR 属性名修复](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6)
- [Vite 修复版本](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)
- [Babel 修复版本](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8)
- [vue-i18n XSS 修复](https://github.com/advisories/GHSA-x8qp-wqqm-57ph)
- [braces 问题及补丁范围](vendor/braces/PATCH.md)
