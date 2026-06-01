<div align="center">

# 🐸 AetherSSH

🔥 **A lightweight, beautiful, and easy-to-use SSH client** 🚀

A beautiful, feature-rich SSH workspace built with Go (Wails) and React.  
Focused on minimal resource usage, stunning micro-interactions, and seamless WebDAV cloud sync.

[![Release](https://img.shields.io/github/v/release/dag6608/Aether-SSH?style=flat-square&color=0078D6&label=RELEASE)](https://github.com/dag6608/Aether-SSH/releases)
[![Platform](https://img.shields.io/badge/PLATFORM-WINDOWS-0078D6.svg?style=flat-square)](https://github.com/dag6608/Aether-SSH/releases)
[![License](https://img.shields.io/badge/LICENSE-MIT-8CBA00.svg?style=flat-square)](LICENSE)

[![Download](https://img.shields.io/github/downloads/dag6608/Aether-SSH/total?style=for-the-badge&color=2EA043&label=DOWNLOAD%20LATEST)](https://github.com/dag6608/Aether-SSH/releases)

[English](./README_EN.md) · [简体中文](./README.md)

</div>

---

AetherSSH is a terminal tool I whipped up in my spare time.
I frequently need to connect to servers, and to balance ultra-low resource consumption with my personal aesthetic preferences, I built this using Wails (Go + React). It's all about being tiny, gorgeous, and blazing fast.
(UI inspiration partially drawn from Netcatty and xterminal—huge thanks!)

---

## ✨ Features

- 🎨 **Aesthetic-First Design**
  - No bloated configurations; the default dark/light modes are comfortable right out of the box.
  - Packed with smooth frosted glass effects, popups, and micro-animation transitions.
- 📥 **WebDAV Cloud Sync**
  - No more hunting for config backups after reinstalling your OS.
  - Connect to a new machine or change a password, and the background agent will silently encrypt and upload a snapshot, allowing for one-click restoration anytime.
- ⚡ **Lightweight & Anti-Multilaunch**
  - Core logic powered by Go—zero bloat.
  - Prevents multiple instances. If a connection is active, closing the window minimizes it to the system tray to save resources.
- 🌐 **Proxy Penetration Ping Test**
  - A neat little easter egg: measures real direct-connection latency via SSH Banner protocols, regardless of what system proxies you're running behind.

---

## 🛠️ Build it yourself

If you want to clone the repo to run or tweak it yourself:

1. Ensure **Go (1.20+)** and **Node.js** are installed.
2. Install Wails CLI:
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```
3. Clone and run the dev server with hot-reload:
   ```bash
   git clone https://github.com/dag6608/Aether-SSH.git
   cd Aether
   wails dev
   ```
4. Build a single executable binary:
   ```bash
   wails build
   ```
   *(To build a full Windows installer with an uninstaller wizard, use the `-nsis` flag, provided you have NSIS installed).*

---

## 🔒 Is my password safe?

Rest assured, security is a priority.
There are no hardcoded keys. On the first run, the app generates a unique 32-byte key file locally (accessible only to you).
Whether it's local SSH passwords or WebDAV credentials, everything is encrypted using the AES-GCM algorithm before being saved to disk.

---

## 📜 License

[MIT License](LICENSE) 
Open source is all about having fun. Use it, modify it, enjoy it!
