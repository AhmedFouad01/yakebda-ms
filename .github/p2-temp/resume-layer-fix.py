from pathlib import Path

path = Path('/tmp/p2-apply-maintainability.py')
text = path.read_text()

layers_start = text.index('def stage_layers():')
layers_end = text.index('\ndef stage_important', layers_start)
text = text[:layers_start] + '''def stage_layers():
    marker = ROOT / ".github/p2-temp/resumed-layer-checkpoint"
    marker.write_text("Layer collapse was validated and committed before this resumed run.\\n")

''' + text[layers_end:]

important_start = text.index('def stage_important():')
important_end = text.index('\ndef controller_names', important_start)
text = text[:important_start] + '''def stage_important():
    import subprocess
    subprocess.run(["node", ".github/p2-temp/rewrite-cascade.mjs"], check=True)

''' + text[important_end:]

path.write_text(text)
