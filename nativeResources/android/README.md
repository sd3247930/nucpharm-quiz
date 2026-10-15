# 核药通 Android 高清桌面图标

母版：`static/brand/android/launcher-source-512.png`，与用户提供的512×512高清图一致。

重新生成：在项目根目录执行 `node scripts/render-android-icons.mjs`（或 `python scripts/render-brand-assets.py --android-only`）。

资源同时提供drawable和mipmap命名空间，因为不同HBuilderX/原生模板可能引用不同类型的 `icon`。不要把432px自适应前景直接当作普通桌面图标：它包含安全区，必须与独立背景组合。

HBuilderX原生资源合并支持的打包流程使用此res目录；手动Android Studio离线工程需将此处res合并到app/src/main/res，并确认原生AndroidManifest的application使用 `android:icon="@mipmap/icon"`，roundIcon（如有）使用同一资源。保持等比缩放，避免设置bitmap的gravity为fill_horizontal或fill_vertical。

修改应用图标后需重新生成并安装完整APK，前端热更新/标准调试基座不会更新桌面图标。

参考：[DCloud图标配置](https://uniapp.dcloud.net.cn/tutorial/app-icons.html)、[DCloud原生资源合并](https://uniapp.dcloud.net.cn/tutorial/app-nativeresource-android.html)。
