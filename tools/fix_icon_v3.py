from PIL import Image, ImageDraw
import sys
import os

def create_squircle_mask(size, radius):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0) + size, radius, fill=255)
    return mask

def process_icon(input_path, output_path, target_size=1024):
    img = Image.open(input_path).convert("RGBA")
    
    # Resize to target size (square)
    img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
    w, h = img.size
    
    # Apply squircle mask with ~22% radius (same as iOS/WeChat style)
    radius = int(min(w, h) * 0.22)
    squircle_mask = create_squircle_mask((w, h), radius)
    
    # Create fully transparent background and paste image with mask
    result = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    result.paste(img, (0, 0), squircle_mask)
    
    result.save(output_path, 'PNG')
    print(f"Saved: {output_path}")

if __name__ == "__main__":
    input_file = r"C:\Users\Angus\.gemini\antigravity\brain\dfa99a39-8eb2-4035-a431-2d28b0cd7058\aether_frog_icon_v3_1780146785488.png"
    
    out1 = r"c:\Users\Angus\Desktop\Antigravity\SSH\Aether-Source\AetherSSH-Go\frontend\src\assets\logo.png"
    out2 = r"c:\Users\Angus\Desktop\Antigravity\SSH\Aether-Source\AetherSSH-Go\build\appicon.png"
    
    process_icon(input_file, out1)
    process_icon(input_file, out2)
    print("Done!")
