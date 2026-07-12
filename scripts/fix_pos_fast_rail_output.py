from pathlib import Path

path = Path('apps/admin/src/pages/Pos.tsx')
text = path.read_text(encoding='utf-8')

broken = '''            {!sourceId && cart.length > 0 && <span className="posx-total-helper">اختر مصدر الطلب لحساب الإجمالي</span>}
              </div>
            )}
          </div>
'''
fixed = '''            {!sourceId && cart.length > 0 && <span className="posx-total-helper">اختر مصدر الطلب لحساب الإجمالي</span>}
          </div>
'''

count = text.count(broken)
if count != 1:
    raise SystemExit(f'cash panel tail cleanup: expected one match, found {count}')

text = text.replace(broken, fixed, 1)
path.write_text(text, encoding='utf-8')
