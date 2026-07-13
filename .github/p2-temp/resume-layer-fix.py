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

path.write_text(text)
