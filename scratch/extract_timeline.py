
import os

html_path = r'd:\Video Editor\Sample\Editor — Clideo.html'
with open(html_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

line_312 = lines[311]
search_str = 'app-timeline'
idx = line_312.find(search_str)

if idx >= 0:
    start = max(0, idx - 100)
    end = min(len(line_312), idx + 50000)
    snippet = line_312[start:end]
    with open(r'd:\Video Editor\scratch\timeline_snippet.txt', 'w', encoding='utf-8') as f:
        f.write(snippet)
else:
    print("Not found in line 312")
