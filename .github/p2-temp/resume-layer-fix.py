from pathlib import Path

path = Path('/tmp/p2-apply-maintainability.py')
text = path.read_text()

layers_start = text.index('def stage_layers():')
layers_end = text.index('\ndef stage_important', layers_start)
text = text[:layers_start] + '''def stage_layers():
    import os
    marker = ROOT / ".github/p2-temp/resumed-layer-checkpoint"
    previous = marker.read_text() if marker.exists() else ""
    marker.write_text(previous + f"Validated again in workflow {os.environ.get('GITHUB_RUN_ID', 'local')}.\\n")

''' + text[layers_end:]

important_start = text.index('def stage_important():')
important_end = text.index('\ndef controller_names', important_start)
text = text[:important_start] + '''def stage_important():
    import subprocess
    subprocess.run(["node", ".github/p2-temp/rewrite-cascade.mjs"], check=True)

''' + text[important_end:]

old_shift = '    shift = block(848, 916)'
old_product = '    product = block(918, len(lines))'
assert old_shift in text, old_shift
assert old_product in text, old_product
text = text.replace(old_shift, '    shift = block(848, 914)', 1)
text = text.replace(old_product, '    product = block(915, len(lines))', 1)

path.write_text(text)
