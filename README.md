<div align="center">

# 🐸 AetherSSH

**一款兼具现代极简视觉与极致交互体验的跨平台 SSH 客户端**

[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Wails](https://img.shields.io/badge/Built%20with-Wails-47CCD6.svg?style=for-the-badge&logo=go)](https://wails.io)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB.svg?style=for-the-badge&logo=react)](https://react.dev)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6.svg?style=for-the-badge&logo=windows)](https://microsoft.com)

---

Aether 是一款专为开发者设计的现代 SSH 终端连接工具。它突破了传统 SSH 客户端单调刻板的视觉局限，采用令人惊艳的现代化 UI，拥有顺滑细腻的微交互动画，并集成了多项深度本地化、自动云端同步等高阶功能，致力于提供非凡的终端连接和设备管理体验。本项目的UI灵感参考了Netcatty和xterminal

[✨ 核心功能亮点](#-核心功能亮点) • [🏗️ 技术架构](#-技术架构) • [🚀 开发者运行与构建指南](#-开发者运行与构建指南) • [🔒 安全性设计](#-安全性设计) • [📜 开源协议](#-开源协议)

</div>

---

## ✨ 核心功能亮点

- 🎨 **极具品质感的现代化 UI**
  - 精心调配的暗色调色彩系统，带来沉浸式、极佳舒适度的终端开发视觉。
  - 深度微交互体验：弹窗、按钮悬浮、加载动画皆具有优雅顺滑的过渡效果。
- 📥 **WebDAV 云端备份与智能恢复**
  - 集成无感 WebDAV 云同步。支持一键备份本地所有连接，并支持**历史备份列表展示与按时间自主选择恢复**。
- 📂 **智能无损数据迁移**
  - 完美解决传统软件升级导致的配置丢失问题。新旧版路径自动识别，实现配置数据无缝、零丢失迁移。
- ⚙️ **系统托盘与后台常驻机制**
  - 拥有类似主流即时通讯软件的后台挂起机制：
    - 当**有服务器处于连接状态**时，关闭窗口会自动收纳至系统托盘，并弹出贴心的后台运行提示。
    - 当**无任何连接活动**时，单击关闭将直接完全退出，不占用任何多余系统资源。
- 🧹 **完全绿色的智能卸载引导**
  - 采用高度定制的 NSIS 安装/卸载引擎，提供全中文卸载交互。
  - 卸载时不仅能删除程序本身，还能智能识别并引导用户彻底清理一切本地配置、缓存和残留数据文件夹，给系统留下百分之百的纯净。

---

## 🏗️ 技术架构

Aether 基于前沿的桌面混合应用架构开发，结合了 Go 语言原生级的系统控制力与 React 卓越的前端动态渲染表现：

```
                    ┌─────────────────────────┐
                    │      React Frontend     │
                    │   (Vite + Lucide Icons) │
                    └────────────┬────────────┘
                                 │ Wails IPC
                                 ▼
                    ┌─────────────────────────┐
                    │      Go Wails Core      │
                    │   (SSH Core, WebDAV)    │
                    └────────────┬────────────┘
                                 │ OS APIs
                                 ▼
                    ┌─────────────────────────┐
                    │     Windows System      │
                    │ (Config dir, Tray, SSH) │
                    └─────────────────────────┘
```

- **后端**：Go 1.20+ (Wails 框架) —— 负责系统级操作、AES 加密存储、WebDAV 通信、原生 SSH 隧道管理及托盘后台控制。
- **前端**：React 18 + Vite —— 负责现代极简视效界面渲染，以及优雅的交互逻辑控制。

---

## 🚀 开发者运行与构建指南

我们致力于让每一个开发者都能零门槛快速上手。请按照以下步骤在您的本地环境中运行和构建 Aether。

### 1. 前置依赖准备
确保您的本地开发机已安装以下工具：
- **Go** (推荐 1.20 或更高版本)
- **Node.js** (推荐 v18 或更高版本，且配有 `npm` / `pnpm` / `yarn`)
- **Wails CLI** (Wails 混合应用开发工具)
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

### 2. 本地克隆与开发调试
克隆项目到本地，并进入项目根目录：
```bash
git clone https://github.com/yourusername/Aether.git
cd Aether
```

启动本地开发实时热重载（Hot-reload）服务器：
```bash
wails dev
```
运行此命令后，Wails 会自动：
1. 安装前端的 `node_modules` 依赖并热编译前端代码。
2. 编译 Go 后端，并在本地拉起一个开发测试窗口。
3. 您在任何前端或后端代码的修改，都会在窗口中即时热更新展现。

### 3. 项目打包构建
如果您需要打包最终的生产环境可执行程序或安装向导包：

#### 编译生成标准绿色版 EXE：
```bash
wails build
```
编译产物将会输出在 `./build/bin/` 目录下。

#### 编译并打包为带卸载清理引导的 Windows 安装包 (NSIS)：
> [!IMPORTANT]
> 执行此步骤需要您的 Windows 环境中已配置并安装 **NSIS (Nullsoft Scriptable Install System)** 编译器。
```bash
wails build -nsis
```
此命令将生成带有专属精美图标和全中文一键卸载引导的专业版 Windows 安装包。

---

## 🔒 安全性设计

为了保证每一位用户的服务器密码和凭据安全，Aether 开源版本重构了本地数据的安全屏障：
- **专属动态密钥**：摒弃任何形式的硬编码密钥。软件在首次运行或升级时，将在本地专属配置目录中随机生成 32 字节的专属密钥文件 `aether.key`，并赋予 `0600` 文件系统严格读写权限。
- **AES-GCM 加密**：所有本地存储的 SSH 服务器连接密码、私钥密码短语以及 WebDAV 的接入密码，均采用业内首选的 AES-GCM 工业级加密算法结合个人专属密钥进行持久化存储。
- **旧版本平滑升级兼容**：程序运行时如检测到老版本的明文硬编码加密配置，将自动在后台零感完成数据的解密与重新随机密钥加密，保证数据安全性瞬间跃升。

---

## 📜 开源协议

本项目采用 **[MIT 开源许可证](LICENSE)**。
您可以非常自由地复制、修改、分发及用于商业用途，唯需在修改或分发的副本中保留原作者的版权声明和许可声明。
