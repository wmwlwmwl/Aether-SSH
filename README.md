<div align="center">

# 🐸 AetherSSH

🔥 **一个轻量、好看、好用的 SSH 客户端** 🚀

日常开发与服务器管理必备，基于 Go (Wails) 与 React 构建。  
主打低资源占用、高颜值微交互体验与便捷的 WebDAV 云端同步。

[![Release](https://img.shields.io/github/v/release/dag6608/Aether-SSH?style=flat-square&color=0078D6&label=RELEASE)](https://github.com/dag6608/Aether-SSH/releases)
[![Platform](https://img.shields.io/badge/PLATFORM-WINDOWS-0078D6.svg?style=flat-square)](https://github.com/dag6608/Aether-SSH/releases)
[![License](https://img.shields.io/badge/LICENSE-MIT-8CBA00.svg?style=flat-square)](LICENSE)

[![Download](https://img.shields.io/github/downloads/dag6608/Aether-SSH/total?style=for-the-badge&color=2EA043&label=DOWNLOAD%20LATEST)](https://github.com/dag6608/Aether-SSH/releases)

[English](./README_EN.md) · [简体中文](./README.md)

</div>

---

AetherSSH 是自己业余时间搓出来的一款 SSH 终端工具。
平时自己经常需要连接服务器，为了兼顾极低的资源占用和个人的审美偏好，
所以我用 Wails (Go + React) 写了这玩意儿，主打一个体积小、颜值高、启动快。
（UI 灵感部分参考了 Netcatty 和 xterminal，感谢！）

---

## ✨ 搞了些什么功能？

- 🎨 **界面尽量好看**
  - 没有复杂的配置，默认的暗黑/浅色模式就足够舒心。
  - 做了很多半透明毛玻璃、弹窗和按钮的微动画过渡。
- 📥 **WebDAV 云端同步**
  - 不想哪天重装系统后四处找配置备份，所以加了 WebDAV 同步功能。
  - 连过新机器或者改了密码，后台会自己悄悄加密传一份快照，随时可以查看历史列表并一键恢复。
- ⚡ **轻量、防多开**
  - 核心逻辑用 Go 跑的，一点不臃肿。
  - 做了防多开限制。只要还有连接开着，关掉窗口就会自动缩小到右下角系统托盘，不浪费资源。
- 🌐 **代理穿透测速**
  - 有个小彩蛋功能：用 SSH Banner 协议测速。不管你套了啥系统代理，都能精准测出这台机器的真实直连延迟。

---

## 🛠️ 自己动手编译

如果你想自己克隆下来跑一跑或者二开，看这里：

1. 确保电脑里装了 **Go (1.20+)** 和 **Node.js**
2. 安装 Wails 开发工具：
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```
3. 克隆项目并本地启动热重载：
   ```bash
   git clone https://github.com/dag6608/Aether-SSH.git
   cd Aether
   wails dev
   ```
4. 打包出一个单文件可执行程序：
   ```bash
   wails build
   ```
   *(如果想打成带中文界面和卸载引导的安装包，加上 `-nsis` 参数即可，前提是你装了 NSIS 编译器)*

---

## 🔒 密码存得安全吗？

密码安全这块大家大可放心。
现在的版本没有写死任何密钥，软件第一次跑的时候，会在本地随机生成一个你专属的 32 位密钥文件（权限只有你自己能读写）。
不管你是保存在本地的 SSH 密码，还是 WebDAV 密码，统统都会用 AES-GCM 算法加密一遍才会落地保存。

---

## 📜 协议

[MIT License](LICENSE) 
开源就是图个乐，随便用，随便改。大家开心就好。
