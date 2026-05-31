from PIL import Image, ImageDraw
import sys
import os

def create_squircle_mask(size, radius):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0) + size, radius, fill=255)
    return mask

def create_circle_mask(size):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0) + size, fill=255)
    return mask

def process_icon(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    
    w, h = img.size
    
    # Crop the center face (approx 75% of the original square icon)
    crop_size = int(min(w, h) * 0.75)
    left = (w - crop_size) // 2
    top = (h - crop_size) // 2
    right = left + crop_size
    bottom = top + crop_size
    
    face_img = img.crop((left, top, right, bottom))
    
    # Make the cropped face circular
    circle_mask = create_circle_mask(face_img.size)
    face_img.putalpha(circle_mask)
    
    # Create the white squircle background
    bg_size = (w, h)
    bg = Image.new('RGBA', bg_size, (255, 255, 255, 0)) # Transparent background
    
    # 25% border radius is typical for squircles (like iOS/macOS)
    radius = int(min(w, h) * 0.25)
    squircle_mask = create_squircle_mask(bg_size, radius)
    white_bg = Image.new('RGBA', bg_size, (255, 255, 255, 255))
    
    # Paste white rounded rect on the transparent background
    bg.paste(white_bg, (0, 0), squircle_mask)
    
    # Make the circular frog face a bit smaller to leave a white margin
    # Let's say face takes up 88% of the squircle
    face_size = int(min(w, h) * 0.88)
    face_img = face_img.resize((face_size, face_size), Image.Resampling.LANCZOS)
    
    # Center the face on the squircle
    paste_x = (w - face_img.width) // 2
    paste_y = (h - face_img.height) // 2
    
    # Composite the circular face over the white squircle
    bg.alpha_composite(face_img, (paste_x, paste_y))
    
    bg.save(output_path)
    print(f"Successfully processed icon to {output_path}")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(base_dir, "logo.png")
    
    if not os.path.exists(input_file):
        print(f"Input file not found: {input_file}")
        sys.exit(1)
        
    process_icon(input_file, input_file) # Overwrite logo.png
    
    # Also overwrite build/appicon.png for Wails
    wails_icon = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(base_dir))), "build", "appicon.png")
    if os.path.exists(os.path.dirname(wails_icon)):
        process_icon(input_file, wails_icon)
        print(f"Also updated {wails_icon}")
