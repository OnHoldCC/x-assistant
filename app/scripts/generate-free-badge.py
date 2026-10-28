"""Render the OnHold gold sweep badge; requires Pillow and a local Chinese font."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

output = Path(__file__).resolve().parents[1] / 'public'
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 68)
size = (336, 88)
base = Image.new('RGB', size)
pixels = base.load()
for y in range(size[1]):
    t = y / (size[1] - 1)
    color = tuple(round(a + (b - a) * t) for a, b in zip((255, 229, 151), (220, 154, 44)))
    for x in range(size[0]):
        pixels[x, y] = color
paint = ImageDraw.Draw(base)
paint.rounded_rectangle((1, 1, 334, 86), radius=18, outline=(169, 108, 27), width=2)
text = '永久免费'
left, top, right, bottom = paint.textbbox((0, 0), text, font=font, stroke_width=1)
paint.text(((size[0] - right + left) / 2 - left, (size[1] - bottom + top) / 2 - top), text, font=font, fill=(65, 39, 8), stroke_width=1, stroke_fill=(65, 39, 8))
mask = Image.new('L', size)
ImageDraw.Draw(mask).rounded_rectangle((1, 1, 334, 86), radius=18, fill=255)
frames = []
for index in range(32):
    x = -120 + index / 31 * 580
    light = Image.new('L', size)
    stripe = ImageDraw.Draw(light)
    stripe.polygon([(x - 26, 0), (x + 10, 0), (x + 68, 88), (x + 32, 88)], fill=92)
    stripe.polygon([(x - 10, 0), (x + 1, 0), (x + 59, 88), (x + 48, 88)], fill=180)
    light = Image.composite(light.filter(ImageFilter.GaussianBlur(4)), Image.new('L', size), mask)
    frames.append(Image.composite(Image.new('RGB', size, 'white'), base, light))
frames.append(base)
frames[0].save(output / 'free-policy.gif', save_all=True, append_images=frames[1:], duration=[45] * 32 + [1800], loop=0, optimize=False, disposal=2)
base.save(output / 'free-policy.png')
check = Image.open(output / 'free-policy.gif')
assert check.n_frames >= 20 and check.size == size and check.info['loop'] == 0
assert right - left >= size[0] * .8
print('Generated gold badge:', check.n_frames, 'frames; text width:', right - left)
