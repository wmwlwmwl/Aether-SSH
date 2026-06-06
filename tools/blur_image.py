import os
from PIL import Image, ImageFilter

brain_dir = r"C:\Users\Angus\.gemini\antigravity\brain\dfa99a39-8eb2-4035-a431-2d28b0cd7058"
img_path = os.path.join(brain_dir, "media__1780770744774.png")
output_path = os.path.join(brain_dir, "media__1780770744774_clean.png")

def blur_area(img, box, radius=8):
    crop_img = img.crop(box)
    blur_img = crop_img.filter(ImageFilter.GaussianBlur(radius))
    img.paste(blur_img, box)

if os.path.exists(img_path):
    with Image.open(img_path) as img:
        clean_img = img.copy()
        
        # 1. 终端敏感主机名打码: X 32-160, Y 90-112
        blur_area(clean_img, (32, 90, 160, 112), radius=6)
        
        # 2. 右侧系统 IP 地址打码: X 905-1015, Y 65-92
        blur_area(clean_img, (905, 65, 1015, 92), radius=6)
        
        clean_img.save(output_path)
        print("Cleaned image generated successfully at:", output_path)
else:
    print("Source image not found!")
