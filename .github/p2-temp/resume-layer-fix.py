from pathlib import Path

path = Path('/tmp/p2-apply-maintainability.py')
text = path.read_text()

old_find = "re.findall(r'(?m)^@import\\s+[^;]+;\\s*$', content)"
new_find = "re.findall(r'(?m)^@import[^\\n]*$', content)"
old_remove = "re.sub(r'(?m)^@import\\s+[^;]+;\\s*\\n?', '', content)"
new_remove = "re.sub(r'(?m)^@import[^\\n]*\\n?', '', content)"

assert text.count(old_find) == 1, text.count(old_find)
assert text.count(old_remove) == 1, text.count(old_remove)
text = text.replace(old_find, new_find, 1)
text = text.replace(old_remove, new_remove, 1)
path.write_text(text)
