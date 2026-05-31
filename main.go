package main

import (
	"context"
	"embed"
	"os"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/windows/icon.ico
var icon []byte

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Setup systray
	onReady := func() {
		systray.SetIcon(icon)
		systray.SetTitle("Aether")
		systray.SetTooltip("Aether SSH")

		mShow := systray.AddMenuItem("显示主窗口", "Show Main Window")
		mQuit := systray.AddMenuItem("完全退出", "Quit Aether")

		// Handle left click on the tray icon to show window
		systray.SetOnClick(func(menu systray.IMenu) {
			if app.ctx != nil {
				runtime.WindowShow(app.ctx)
			}
		})

		mShow.Click(func() {
			if app.ctx != nil {
				runtime.WindowShow(app.ctx)
			}
		})

		mQuit.Click(func() {
			systray.Quit()
			os.Exit(0)
		})
	}
	onExit := func() {}

	// Run systray in background
	go systray.Run(onReady, onExit)

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "Aether",
		Width:  1440,
		Height: 900,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 8, G: 12, B: 20, A: 255}, // #080c14
		OnStartup:        app.startup,
		// 拦截窗口关闭：隐藏到后台而非退出
		OnBeforeClose: func(ctx context.Context) bool {
			runtime.WindowHide(ctx)
			return true // return true = 取消关闭，由 WindowHide 处理
		},
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent:              true,
			WindowIsTranslucent:               true,
			DisableWindowIcon:                 false,
			DisableFramelessWindowDecorations: false,
			WebviewUserDataPath:               "",
			ZoomFactor:                        1.0,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
