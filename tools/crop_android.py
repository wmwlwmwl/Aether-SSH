import os
from PIL import Image

# 文件路径
assets_img = r"C:\Users\Angus\Desktop\Antigravity\SSH\Source_Codes\Aether-Source\AetherSSH-Go\assets\android_quick_connect.jpg"
backup_img = r"c:\Users\Angus\Desktop\Antigravity\SSH\软件图片\android_quick_connect.jpg"

def remove_status_bar(img_path):
    if not os.path.exists(img_path):
        print(f"File not found: {img_path}")
        return
    
    with Image.open(img_path) as img:
        width, height = img.size
        # 裁剪顶部约 110 像素（一般状态栏在 100px 以内）
        top_crop = 110
        cropped_img = img.crop((0, top_crop, width, height))
        # 保存时使用高质量
        cropped_img.save(img_path, quality=95)
        print(f"Successfully cropped status bar from {img_path}")

# 处理 assets 下的图
remove_status_bar(assets_img)
# 顺便处理备份目录下的图，防止下次拷错
remove_status_bar(backup_img)
