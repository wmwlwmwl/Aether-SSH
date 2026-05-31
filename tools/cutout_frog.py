from rembg import remove
from PIL import Image
import sys

def remove_background(input_path, output_path):
    print(f"Processing {input_path} with rembg...")
    with open(input_path, 'rb') as i:
        with open(output_path, 'wb') as o:
            input_bytes = i.read()
            output_bytes = remove(input_bytes)
            o.write(output_bytes)
    print(f"Successfully removed background and saved to {output_path}")

if __name__ == "__main__":
    input_file = r"C:\Users\Angus\.gemini\antigravity\brain\dfa99a39-8eb2-4035-a431-2d28b0cd7058\frog_app_icon_1780132473306.png"
    out1 = r"c:\Users\Angus\Desktop\Antigravity\SSH\Aether-Source\AetherSSH-Go\frontend\src\assets\logo.png"
    out2 = r"c:\Users\Angus\Desktop\Antigravity\SSH\Aether-Source\AetherSSH-Go\build\appicon.png"
    
    remove_background(input_file, out1)
    remove_background(input_file, out2)
