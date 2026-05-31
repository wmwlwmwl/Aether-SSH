from PIL import Image, ImageDraw
import sys
import os

def create_squircle_mask(size, radius):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0) + size, radius, fill=255)
    return mask

def process_icon(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    
    # Create the squircle mask for the entire image
    # WeChat typically uses a ~22.5% radius relative to the width
    radius = int(min(w, h) * 0.225)
    squircle_mask = create_squircle_mask((w, h), radius)
    
    # Create a transparent image and paste the original image using the squircle mask
    bg = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bg.paste(img, (0, 0), squircle_mask)
    
    bg.save(output_path)
    print(f"Successfully fixed icon to {output_path}")

if __name__ == "__main__":
    input_file = "C:/Users/Angus/.gemini/antigravity/brain/dfa99a39-8eb2-4035-a431-2d28b0cd7058/frog_app_icon_1780132473306.png"
    out1 = "c:/Users/Angus/Desktop/Antigravity/SSH/Aether-Source/AetherSSH-Go/frontend/src/assets/logo.png"
    out2 = "c:/Users/Angus/Desktop/Antigravity/SSH/Aether-Source/AetherSSH-Go/build/appicon.png"
    
    process_icon(input_file, out1)
    process_icon(input_file, out2)
