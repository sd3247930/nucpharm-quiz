# braces 3.0.3 安全回补

来源：上游 [micromatch/braces](https://github.com/micromatch/braces)，npm 3.0.3。保留 MIT License、作者和上游来源；tarball、原始源码 SHA-256 记录见 `provenance.json`。此目录是本项目维护的安全回补，以独立包身份 `@nucpharm/braces-backport@3.0.3-nucpharm.1` 标记，不能当作官方发布的修复版。根依赖名仍为 `braces`，指向此本地包以兼容原调用方。

处理 [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)：上游当前没有已发布的修复版本。官方问题说明见 [issue 70](https://github.com/micromatch/braces/issues/70)。

修改：

- `lib/parse.js`：进入花括号或圆括号块时，将嵌套深度限制为 100。超限在解析阶段以 `ERR_BRACES_DEPTH` 拒绝，不等到递归遍历耗尽调用栈；未闭合输入同样受限。
- `lib/depth-guard.js`：迭代校验外部传入 AST 的子节点深度、节点总量和重复/循环子节点，不递归校验，不遍历正常的 parent / prev 回指。
- `compile.js`、`expand.js`、`stringify.js`：调用递归遍历前先校验 AST，避免通过直接传 AST 绕过字符串解析限制。

正常文件 glob、集合、范围、引号、转义字符保持原行为；过度嵌套或超过 20,000 节点的手写 AST 将被拒绝。此补丁针对上述递归漏洞，不代表允许把任意不可信 glob 当作安全的正则执行服务。

根 `package.json` 的 overrides 将传递依赖定向到此目录。不同 npm 版本处理 file 依赖的方式不同：npm 10 会按包身份检查，无法识别上游版本内的本地源码改动；npm 11 会跳过本地链接包的注册表告警。独立包身份准确区分本地维护代码，**更名与 audit 为 0 都不能单独证明补丁有效**；必须同时通过 `npm run test:security` 的恶意输入回归及完整构建测试。禁止只更名、改版本号、忽略告警或提高审计阈值假装修复。npm 10 与 npm 11 都应验证。

维护：跟踪上游正式修复，发布后替换为注册表版本、删除本地覆盖，并继续保留递归漏洞回归测试。更新此目录前检查来源和补丁差异，不能直接覆盖为未修复上游源码。
