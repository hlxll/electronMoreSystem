# 离线资源
https://registry.npmmirror.com/binary.html?path=electron/

或者配置package，保证打包时下载其他资源顺利

# 打包更新
electron-builder打包，配置publish为github，实现自动更新

# 更新配置
在github仓库中创建一个release，上传更新包，更新配置文件latest.yml

本地实现一个服务，用于提供更新包下载
electron-updater 配置 feedUrl 为本地服务地址
这个更新是更新安装包，在preload，主进程，依赖变更，才需要替换安装包
他的增量更新，也只是依靠electron-builder打包的.block文件，这个文件将安装包按一定大小切割后形成一个hash文件，
每次更新时，会对比这个hash文件，判断是否有变更，有变更则下载变更部分，否则直接使用本地安装包
最终都是替换安装包，所以需要在更新完成后，重启应用
应用重启后，会检查是否有新的更新，如果有，会自动下载并安装
没有，会提示用户没有新的更新

## 热更新资源
1： 在读取必要资源时，使用统一的方法，先读取用户目录下指定文件，再读取resource或者asar中的
2： 当需要更新时，将更新文件服务器中的资源下载到用户目录下