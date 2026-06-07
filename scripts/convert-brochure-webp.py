#!/usr/bin/env python3
"""Convert brochure <img> tags to <picture> with WebP fallback."""
import re
import os
import glob

BROCHURE_DIR = 'public/brochure'

def has_webp(src):
    local_path = 'public/' + src.lstrip('/')
    webp_path = os.path.splitext(local_path)[0] + '.webp'
    return os.path.exists(webp_path)

for html_file in sorted(glob.glob(os.path.join(BROCHURE_DIR, '*.html'))):
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()

    counts = [0, 0]  # [img_count, converted]

    def replace_img(match):
        counts[0] += 1
        full_tag = match.group(0)

        src_match = re.search(r'src="([^"]+)"', full_tag)
        if not src_match:
            return full_tag
        src = src_match.group(1)

        if not has_webp(src):
            return full_tag

        webp_src = os.path.splitext(src)[0] + '.webp'

        alt_match = re.search(r'alt="([^"]*)"', full_tag)
        alt = alt_match.group(1) if alt_match else ''

        counts[1] += 1
        return (
            f'<picture>\n'
            f'  <source srcset="{webp_src}" type="image/webp">\n'
            f'  <img src="{src}" alt="{alt}" loading="lazy" decoding="async" width="800" height="600">\n'
            f'</picture>'
        )

    new_content = re.sub(r'<img\s[^>]*src="[^"]*"[^>]*>', replace_img, content)

    if new_content != content:
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'{html_file}: {counts[1]}/{counts[0]} images converted')
    else:
        print(f'{html_file}: no changes')
