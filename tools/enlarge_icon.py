from PIL import Image
import sys

def crop_transparent(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    
    # Get the bounding box of the non-zero alpha pixels
    bbox = img.getbbox()
    if not bbox:
        print(f"Image {input_path} is completely transparent.")
        return
        
    print(f"Original size: {img.size}, Bounding box: {bbox}")
    
    # Crop to the bounding box
    cropped = img.crop(bbox)
    
    # We want a square image to be safe for icons.
    # Find the maximum dimension
    max_dim = max(cropped.size)
    
    # Create a new transparent square image
    square_img = Image.new('RGBA', (max_dim, max_dim), (0, 0, 0, 0))
    
    # Calculate position to paste the cropped image to center it
    paste_x = (max_dim - cropped.width) // 2
    paste_y = (max_dim - cropped.height) // 2
    
    # Paste the cropped image
    square_img.paste(cropped, (paste_x, paste_y))
    
    # Resize slightly up to standard size if needed, but for Wails, any square is fine.
    # Let's resize it to 1024x1024 for highest quality
    final_img = square_img.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    final_img.save(output_path, 'PNG')
    print(f"Successfully cropped and saved to {output_path}")

if __name__ == "__main__":
    out1 = r"c:\Users\Angus\Desktop\Antigravity\SSH\Aether-Source\AetherSSH-Go\frontend\src\assets\logo.png"
    out2 = r"c:\Users\Angus\Desktop\Antigravity\SSH\Aether-Source\AetherSSH-Go\build\appicon.png"
    
    crop_transparent(out1, out1)
    crop_transparent(out2, out2)
