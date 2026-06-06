import os
from PIL import Image, ImageDraw

brain_dir = r"C:\Users\Angus\.gemini\antigravity\brain\dfa99a39-8eb2-4035-a431-2d28b0cd7058"
img_path = os.path.join(brain_dir, "media__1780770744774.png")
output_path = os.path.join(brain_dir, "media__1780770744774_test.png")

if os.path.exists(img_path):
    with Image.open(img_path) as img:
        # 复制图片进行画框测试
        test_img = img.copy()
        draw = ImageDraw.Draw(test_img)
        
        # 1. 终端主机名区域猜测：左上角
        # (left, top, right, bottom)
        draw.rectangle([5, 90, 250, 120], outline="red", width=2)
        
        # 2. 系统面板 IP 地址区域猜测：右上角系统面板内
        # 1024 x 613 中，右侧面板大概占 800 - 1024，IP 在“系统”那一行的右侧
        draw.rectangle([900, 115, 1015, 140], outline="red", width=2)
        
        test_img.save(output_path)
        print("Test image generated successfully at:", output_path)
else:
    print("Source image not found!")
