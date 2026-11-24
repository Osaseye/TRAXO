import os
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def generate_pwa_icons():
    # Source mark
    source_path = 'public/brand/traxo-mark.png'
    if not os.path.exists(source_path):
        source_path = 'public/TRAXO.png'

    print(f"Loading source icon from: {source_path}")
    src_img = Image.open(source_path).convert("RGBA")

    # Crop to content if needed or use full square
    # The source is 1024x1024 with dark background (12, 13, 15)
    # We want crisp icons with dark background matching #09090B
    bg_color = (9, 9, 11, 255) # #09090B

    # 1. 512x512 standard PWA icon
    icon_512 = Image.new("RGBA", (512, 512), bg_color)
    # Resize src_img preserving aspect ratio
    resized_src_512 = src_img.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.paste(resized_src_512, (0, 0), resized_src_512 if resized_src_512.mode == 'RGBA' else None)
    icon_512.save('public/pwa-512x512.png', 'PNG', optimize=True)
    print("Created public/pwa-512x512.png")

    # 2. 192x192 standard PWA icon
    icon_192 = Image.new("RGBA", (192, 192), bg_color)
    resized_src_192 = src_img.resize((192, 192), Image.Resampling.LANCZOS)
    icon_192.paste(resized_src_192, (0, 0), resized_src_192 if resized_src_192.mode == 'RGBA' else None)
    icon_192.save('public/pwa-192x192.png', 'PNG', optimize=True)
    print("Created public/pwa-192x192.png")

    # 3. 180x180 Apple Touch Icon (iOS requires opaque, no transparency)
    icon_apple = Image.new("RGBA", (180, 180), bg_color)
    resized_apple = src_img.resize((180, 180), Image.Resampling.LANCZOS)
    icon_apple.paste(resized_apple, (0, 0), resized_apple if resized_apple.mode == 'RGBA' else None)
    # Convert to RGB to ensure zero alpha issues on iOS Safari
    icon_apple.convert("RGB").save('public/apple-touch-icon.png', 'PNG', optimize=True)
    print("Created public/apple-touch-icon.png")

    # 4. 512x512 Maskable Icon
    # Android maskable icons require an 80% safe zone (10% padding on all sides)
    # so the central content fits within a circle with radius 40% of the canvas.
    maskable_512 = Image.new("RGBA", (512, 512), bg_color)
    content_size = int(512 * 0.80) # 410px
    resized_content = src_img.resize((content_size, content_size), Image.Resampling.LANCZOS)
    offset = (512 - content_size) // 2
    maskable_512.paste(resized_content, (offset, offset), resized_content if resized_content.mode == 'RGBA' else None)
    maskable_512.save('public/maskable-icon-512x512.png', 'PNG', optimize=True)
    print("Created public/maskable-icon-512x512.png")

    # 5. Favicon sizes (32x32, 16x16, 48x48 for favicon.ico)
    fav_32 = icon_512.resize((32, 32), Image.Resampling.LANCZOS)
    fav_32.save('public/favicon-32x32.png', 'PNG', optimize=True)
    
    fav_16 = icon_512.resize((16, 16), Image.Resampling.LANCZOS)
    fav_16.save('public/favicon-16x16.png', 'PNG', optimize=True)

    # Multi-resolution favicon.ico
    icon_512.save('public/favicon.ico', format='ICO', sizes=[(16,16), (32,32), (48,48), (64,64)])
    print("Created public/favicon.ico, favicon-32x32.png, favicon-16x16.png")

if __name__ == '__main__':
    generate_pwa_icons()
