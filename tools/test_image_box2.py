import os
from PIL import Image, ImageDraw

brain_dir = r"C:\Users\Angus\.gemini\antigravity\brain\dfa99a39-8eb2-4035-a431-2d28b0cd7058"
img_path = os.path.join(brain_dir, "media__1780770744774.png")
output_path = os.path.join(brain_dir, "media__1780770744774_test2.png")

if os.path.exists(img_path):
    with Image.open(img_path) as img:
        test_img = img.copy()
        draw = ImageDraw.Draw(test_img)
        
        # 1. 终端仅遮盖敏感主机名 racknerd-755293 (保留 root@ 和 :~#)
        # 估算坐标: X 42-168, Y 92-116
        draw.rectangle([42, 92, 168, 116], outline="red", width=2)
        
        # 2. 系统面板精确框住 IP 107.174.139.43
        # 估算坐标: X 900-1015, Y 95-118
        draw.rectangle([900, 95, 1015, 118], outline="red", width=2)
        
        test_img.save(output_path)
        print("Second test image generated successfully at:", output_path)
else:
    print("Source image not found!")
