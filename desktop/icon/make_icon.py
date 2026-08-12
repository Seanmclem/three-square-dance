# SquareDance app icon: two overlapping square outlines (dark navy behind,
# periwinkle in front, slight translucency where they cross) on a white
# rounded-rect macOS tile. Outputs 1024 png + multi-size ico.
from PIL import Image, ImageDraw

S = 1024
NAVY = (19, 26, 51, 255)
PERI = (88, 101, 214, 235)   # slightly translucent so the overlap reads
WHITE = (255, 255, 255, 255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# macOS-style tile: rounded rect with margin for the system to breathe
margin, radius = 64, 200
d.rounded_rectangle([margin, margin, S - margin, S - margin], radius=radius, fill=WHITE)

def square_outline(layer_draw, x0, y0, size, stroke, color):
    layer_draw.rectangle([x0, y0, x0 + size, y0 + size], fill=color)
    layer_draw.rectangle([x0 + stroke, y0 + stroke, x0 + size - stroke, y0 + size - stroke],
                         fill=(0, 0, 0, 0))

# stroke = side/8; diagonal offset = side*0.50 → each corner lands exactly on
# the other square's center (brand/style-guide.html §01 construction)
sq, stroke = 430, 54

# dark square, upper right (opaque, drawn straight on)
dark = Image.new("RGBA", (S, S), (0, 0, 0, 0))
dd = ImageDraw.Draw(dark)
square_outline(dd, 405, 190, sq, stroke, NAVY)
img = Image.alpha_composite(img, dark)

# periwinkle square, lower left, composited over
blue = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(blue)
square_outline(bd, 190, 405, sq, stroke, PERI)
img = Image.alpha_composite(img, blue)

img.save("/Users/seanclements/repos/2026/three-world-builder/desktop/icon/squaredance.png")
img.resize((256, 256), Image.LANCZOS).save(
    "/Users/seanclements/repos/2026/three-world-builder/desktop/icon/squaredance.ico",
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print("written")
