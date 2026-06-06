import os
import shutil

brain_dir = r"C:\Users\Angus\.gemini\antigravity\brain\dfa99a39-8eb2-4035-a431-2d28b0cd7058"
dest_dir = r"C:\Users\Angus\Desktop\Antigravity\SSH\Source_Codes\Aether-Source\AetherSSH-Go\assets"

mapping = {
    "media__1780770728601.png": "pc_empty_main.png",
    "media__1780770744774_clean.png": "pc_connected_session.png",
    "media__1780770767501.jpg": "android_quick_connect.jpg"
}

if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

for src_name, dest_name in mapping.items():
    src_path = os.path.join(brain_dir, src_name)
    dest_path = os.path.join(dest_dir, dest_name)
    if os.path.exists(src_path):
        shutil.copy(src_path, dest_path)
        print(f"Copied {src_name} -> {dest_path}")
    else:
        print(f"Source file {src_path} not found!")
